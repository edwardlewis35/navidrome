package onlinecover

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	"github.com/navidrome/navidrome/tests"
)

func coverSettingsAdmin(t *testing.T) context.Context {
	t.Helper()
	return request.WithUser(t.Context(), model.User{ID: "admin", IsAdmin: true})
}

func TestCoverSettingsRequireAdminAndPersistExplicitDirect(t *testing.T) {
	repo := &tests.MockedPropertyRepo{}
	c := NewStoredCatalog(repo, "http://server.example:7891")
	admin := coverSettingsAdmin(t)
	for _, ctx := range []context.Context{t.Context(), request.WithUser(t.Context(), model.User{ID: "listener"})} {
		if _, err := c.Settings(ctx); !errors.Is(err, model.ErrNotAuthorized) {
			t.Fatal("non-admin read proxy settings")
		}
		if _, err := c.UpdateSettings(ctx, ""); !errors.Is(err, model.ErrNotAuthorized) {
			t.Fatal("non-admin changed proxy settings")
		}
	}
	settings, err := c.Settings(admin)
	if err != nil || settings != (Settings{Proxy: "http://server.example:7891", Source: "server"}) {
		t.Fatalf("server fallback: %+v %v", settings, err)
	}
	if _, err := repo.Get(admin, settingsProperty); !errors.Is(err, model.ErrNotFound) {
		t.Fatal("reading default persisted an override")
	}
	for _, proxy := range []string{"http://127.0.0.1:7891", "https://proxy.example:443", "http://[::1]:7891", ""} {
		settings, err = c.UpdateSettings(admin, proxy)
		if err != nil || settings != (Settings{Proxy: proxy, Source: "saved"}) {
			t.Fatalf("save proxy %q: %+v %v", proxy, settings, err)
		}
		restarted := NewStoredCatalog(repo, "http://changed-server.example:7891")
		loaded, err := restarted.Settings(admin)
		if err != nil || loaded != settings {
			t.Fatalf("restart lost saved proxy: %+v %v", loaded, err)
		}
		if proxy == "" {
			client, err := restarted.httpClient()
			transport, ok := client.Transport.(*http.Transport)
			if err != nil || !ok || transport.Proxy != nil || transport == http.DefaultTransport {
				t.Fatal("saved direct setting still follows environment proxies")
			}
		}
	}
}

func TestCoverSettingsRejectInvalidWithoutOverwriting(t *testing.T) {
	repo := &tests.MockedPropertyRepo{}
	c := NewStoredCatalog(repo, "")
	admin := coverSettingsAdmin(t)
	want, err := c.UpdateSettings(admin, "http://valid.example:7891")
	if err != nil {
		t.Fatal(err)
	}
	before, _ := repo.Get(admin, settingsProperty)
	for _, proxy := range []string{
		" ", "://invalid", "proxy:7891", "socks5://proxy:7891", "http://proxy",
		"http://proxy:0", "http://proxy:65536", "http://proxy:invalid", "http://proxy:7891/",
		"http://user:private-value@proxy:7891", "http://proxy:7891?", "http://proxy:7891?a=b",
		"http://proxy:7891#", "http://proxy:7891#fragment", "http://proxy:7891\n", strings.Repeat("x", 2049),
	} {
		if _, err := c.UpdateSettings(admin, proxy); !errors.Is(err, ErrInvalidSelection) {
			t.Fatalf("accepted invalid proxy %q: %v", proxy, err)
		}
		after, _ := repo.Get(admin, settingsProperty)
		got, err := c.Settings(admin)
		if after != before || err != nil || got != want {
			t.Fatal("invalid proxy overwrote valid settings")
		}
	}
	client, _ := c.httpClient()
	repo.Error = errors.New("fixture database failure")
	if _, err := c.UpdateSettings(admin, "http://other.example:7891"); err == nil {
		t.Fatal("ignored failed persistence")
	}
	current, _ := c.httpClient()
	if current != client {
		t.Fatal("failed persistence changed effective proxy")
	}
	repo.Error = nil
	if got, err := c.Settings(admin); err != nil || got != want {
		t.Fatal("failed persistence changed saved settings")
	}
}

func TestCoverSettingsSwitchClientWithoutResettingLimitsOrOtherClients(t *testing.T) {
	var first, second atomic.Int32
	imageData := fixturePNG(t)
	proxy := func(calls *atomic.Int32) *httptest.Server {
		return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			calls.Add(1)
			if strings.HasPrefix(r.URL.Path, "/ws/") {
				_, _ = io.WriteString(w, `{"releases":[]}`)
			} else {
				_, _ = w.Write(imageData)
			}
		}))
	}
	p1, p2 := proxy(&first), proxy(&second)
	defer p1.Close()
	defer p2.Close()
	global := http.DefaultTransport
	c := NewStoredCatalog(&tests.MockedPropertyRepo{}, p1.URL)
	c.musicBrainz, c.archive = "http://musicbrainz.cover.test", "http://archive.cover.test"
	admin := coverSettingsAdmin(t)
	if _, err := c.Search(admin, "fixture", ""); err != nil {
		t.Fatal(err)
	}
	searches, downloads, fronts := c.searches, c.downloads, c.frontChecks
	if _, err := c.UpdateSettings(admin, p2.URL); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Search(admin, "fixture", ""); !errors.Is(err, ErrBusy) {
		t.Fatal("proxy update reset search rate limit")
	}
	if _, err := c.Download(admin, fixtureRelease); err != nil {
		t.Fatal(err)
	}
	if first.Load() != 1 || second.Load() != 1 || c.searches != searches || c.downloads != downloads || c.frontChecks != fronts {
		t.Fatal("settings recreated catalogue or used old proxy")
	}
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write(imageData) }))
	defer origin.Close()
	c.archive = origin.URL
	if _, err := c.UpdateSettings(admin, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Download(admin, fixtureRelease); err != nil {
		t.Fatal(err)
	}
	other := &http.Client{}
	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, origin.URL, nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := other.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if http.DefaultTransport != global || first.Load() != 1 || second.Load() != 1 {
		t.Fatal("cover setting changed another client")
	}
}

func TestCoverSettingsConcurrentReadsAndUpdates(t *testing.T) {
	c := NewStoredCatalog(&tests.MockedPropertyRepo{}, "")
	admin := coverSettingsAdmin(t)
	var group sync.WaitGroup
	for i := range 8 {
		group.Go(func() {
			for range 20 {
				if i%2 == 0 {
					if _, err := c.UpdateSettings(admin, ""); err != nil {
						t.Error(err)
					}
				} else {
					if _, err := c.Settings(admin); err != nil {
						t.Error(err)
					}
					if _, err := c.Download(admin, "not-a-release"); !errors.Is(err, ErrInvalidSelection) {
						t.Error(err)
					}
				}
			}
		})
	}
	group.Wait()
}

func TestCoverSettingsCorruptSavedValueFailsClosedAndCanBeReplaced(t *testing.T) {
	for _, value := range []string{`not JSON`, `{}`, `{"proxy":null}`, `{"proxy":"http://user:private-value@proxy:7891"}`} {
		repo := &tests.MockedPropertyRepo{Data: map[string]string{settingsProperty: value}}
		c := NewStoredCatalog(repo, "")
		if _, err := c.Settings(coverSettingsAdmin(t)); !errors.Is(err, ErrUnavailable) || strings.Contains(err.Error(), "private-value") {
			t.Fatal("corrupt property exposed details or fell back")
		}
		if _, err := c.Download(t.Context(), fixtureRelease); !errors.Is(err, ErrUnavailable) {
			t.Fatal("download ignored corrupt stored proxy")
		}
		if _, err := c.UpdateSettings(coverSettingsAdmin(t), ""); err != nil {
			t.Fatal("administrator could not repair invalid settings")
		}
	}
}
