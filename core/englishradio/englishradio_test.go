package englishradio

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	"github.com/navidrome/navidrome/tests"
)

func radioFixture(t *testing.T) (*Service, *tests.MockedPropertyRepo, *tests.MockedUserRepo, context.Context) {
	t.Helper()
	properties := &tests.MockedPropertyRepo{}
	users := tests.CreateMockUserRepo()
	u := &model.User{ID: "listener", UserName: "listener", TokenEpoch: 2}
	users.Data[u.UserName] = u
	return New(properties, users), properties, users, request.WithUser(t.Context(), *u)
}

func TestSettingsAreAdminOnlyPersistentAndRadioOnly(t *testing.T) {
	s, properties, users, listener := radioFixture(t)
	global := http.DefaultTransport
	for _, ctx := range []context.Context{t.Context(), listener} {
		if _, err := s.Settings(ctx); err == nil {
			t.Fatal("non-admin read radio proxy")
		}
		if _, err := s.UpdateSettings(ctx, "http://127.0.0.1:7891"); err == nil {
			t.Fatal("non-admin changed radio proxy")
		}
	}
	adminCtx := request.WithUser(t.Context(), model.User{ID: "admin", IsAdmin: true})
	initial, err := s.Settings(adminCtx)
	if err != nil || initial.Proxy != "" {
		t.Fatal("default should be direct")
	}
	for _, proxy := range []string{"http://127.0.0.1:7891", "https://proxy.example:443", "http://[::1]:7891", ""} {
		if _, err := s.UpdateSettings(adminCtx, proxy); err != nil {
			t.Fatal(err)
		}
		restarted := New(properties, users)
		got, err := restarted.Settings(adminCtx)
		if err != nil || got.Proxy != proxy {
			t.Fatalf("settings did not survive restart: %+v %v", got, err)
		}
		transport := restarted.client.Transport.(*http.Transport)
		if proxy == "" {
			if transport.Proxy != nil {
				t.Fatal("direct radio connection follows environment proxy")
			}
		} else {
			u, err := transport.Proxy(&http.Request{URL: &url.URL{Scheme: "https", Host: "media-ice.musicradio.com"}})
			if err != nil || u.String() != proxy {
				t.Fatal("dedicated transport did not use saved proxy")
			}
		}
		if restarted.client.Timeout != 0 || transport.ResponseHeaderTimeout <= 0 {
			t.Fatal("radio must bound connection setup without terminating long playback")
		}
	}
	if http.DefaultTransport != global {
		t.Fatal("changed global transport")
	}
	for key := range properties.Data {
		if key != settingsProperty {
			t.Fatal("radio settings altered another feature")
		}
	}
}

func TestInvalidProxyDoesNotReplaceWorkingSettings(t *testing.T) {
	s, properties, _, _ := radioFixture(t)
	ctx := request.WithUser(t.Context(), model.User{ID: "admin", IsAdmin: true})
	if _, err := s.UpdateSettings(ctx, "https://proxy.example:443"); err != nil {
		t.Fatal(err)
	}
	before, _ := properties.Get(ctx, settingsProperty)
	for _, proxy := range []string{"http://proxy", "http://proxy:0", "http://proxy:65536", "socks5://proxy:7891", "http://user:private-value@proxy:7891", "http://proxy:7891/", "http://proxy:7891?", "http://proxy:7891#", "http://proxy:7891/path", strings.Repeat("x", 2049)} {
		if _, err := s.UpdateSettings(ctx, proxy); !errors.Is(err, ErrInvalidSettings) {
			t.Fatalf("accepted invalid proxy %q: %v", proxy, err)
		}
		if after, _ := properties.Get(ctx, settingsProperty); after != before {
			t.Fatal("invalid proxy replaced working setting")
		}
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func installFixtureStream(s *Service, roundTrip roundTripFunc) {
	s.loaded = true
	s.client = &http.Client{Transport: roundTrip}
}

func TestTicketsAreStationScopedAndStreamsReleaseCapacity(t *testing.T) {
	s, _, users, ctx := radioFixture(t)
	var requests int
	installFixtureStream(s, func(r *http.Request) (*http.Response, error) {
		requests++
		if r.URL.String() != "https://media-ice.musicradio.com/HeartLondonMP3" || r.Header.Get("Icy-MetaData") != "0" || r.Header.Get("Cookie") != "" || r.Header.Get("Authorization") != "" {
			t.Fatal("unexpected upstream request")
		}
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"audio/mpeg"}}, Body: io.NopCloser(strings.NewReader("fixture-audio"))}, nil
	})
	if _, err := s.Ticket(t.Context(), "heart-london"); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("unauthenticated ticket")
	}
	if _, err := s.Ticket(ctx, "https://localhost/anything"); !errors.Is(err, model.ErrNotFound) {
		t.Fatal("arbitrary stream allowed")
	}
	value, err := s.Ticket(ctx, "heart-london")
	if err != nil || len(value) < 40 {
		t.Fatal("missing unpredictable capability")
	}
	if requests != 0 {
		t.Fatal("issuing a ticket opened the stream")
	}
	if _, _, err := s.Open(ctx, "classic-fm", value); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("ticket crossed station boundary")
	}
	first, contentType, err := s.Open(ctx, "heart-london", value)
	if err != nil || contentType != "audio/mpeg" {
		t.Fatal(err)
	}
	second, _, err := s.Open(ctx, "heart-london", value)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Open(ctx, "heart-london", value); !errors.Is(err, ErrBusy) {
		t.Fatal("unbounded streams per user")
	}
	data, err := io.ReadAll(first)
	if err != nil || string(data) != "fixture-audio" {
		t.Fatal("relay changed bytes")
	}
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}
	third, _, err := s.Open(ctx, "heart-london", value)
	if err != nil {
		t.Fatal("closing a stream did not release capacity")
	}
	_ = second.Close()
	_ = third.Close()
	users.Data["listener"].TokenEpoch++
	if _, _, err := s.Open(ctx, "heart-london", value); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("password change did not revoke ticket")
	}
	delete(users.Data, "listener")
	if _, _, err := s.Open(ctx, "heart-london", value); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("deleted user retained access")
	}
	if len(s.active) != 0 || len(s.streams) != 0 {
		t.Fatal("failed stream leaked capacity")
	}
}

func TestTicketExpiryAndInvalidResponses(t *testing.T) {
	s, _, _, ctx := radioFixture(t)
	installFixtureStream(s, func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"text/html"}}, Body: io.NopCloser(strings.NewReader("not audio"))}, nil
	})
	value, err := s.Ticket(ctx, "heart-london")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Open(ctx, "heart-london", value); !errors.Is(err, ErrUnavailable) {
		t.Fatal("accepted non-audio upstream")
	}
	old := s.tickets[value]
	old.expires = time.Now().Add(-time.Minute)
	s.tickets[value] = old
	if _, _, err := s.Open(ctx, "heart-london", value); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("expired ticket allowed")
	}
	if len(s.active) != 0 || len(s.streams) != 0 {
		t.Fatal("invalid response leaked stream slot")
	}
}

func TestEveryCatalogStationUsesItsConfiguredStream(t *testing.T) {
	seen := map[string]bool{}
	for _, station := range Catalog() {
		if seen[station.ID] {
			t.Fatalf("duplicate station ID: %s", station.ID)
		}
		seen[station.ID] = true
		t.Run(station.ID, func(t *testing.T) {
			s, _, _, ctx := radioFixture(t)
			requests := 0
			installFixtureStream(s, func(r *http.Request) (*http.Response, error) {
				requests++
				if r.URL.String() != station.streamURL {
					t.Fatalf("wrong upstream for %s: %s", station.ID, r.URL)
				}
				return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"audio/mpeg"}}, Body: io.NopCloser(strings.NewReader("fixture-audio"))}, nil
			})
			value, err := s.Ticket(ctx, station.ID)
			if err != nil || requests != 0 {
				t.Fatalf("ticket did not resolve without connecting: %v", err)
			}
			body, contentType, err := s.Open(ctx, station.ID, value)
			if err != nil || contentType != "audio/mpeg" || requests != 1 {
				t.Fatalf("catalog station could not play: %v", err)
			}
			if err := body.Close(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestOnlyFixedHTTPSBroadcasterURLsAreAllowed(t *testing.T) {
	for _, station := range Catalog() {
		u, _ := url.Parse(station.streamURL)
		if !allowedStreamURL(u) {
			t.Fatal("catalogue URL rejected")
		}
	}
	for _, raw := range []string{
		"http://media-ice.musicradio.com/HeartLondonMP3",
		"https://127.0.0.1/HeartLondonMP3",
		"https://media-ice.musicradio.com.evil.example/HeartLondonMP3",
		"https://media-ice.musicradio.com:444/HeartLondonMP3",
		"https://user@media-ice.musicradio.com/HeartLondonMP3",
		"https://media-ice.musicradio.com/HeartLondonMP3?target=private",
		"https://media-ice.musicradio.com/CapitalMP3?",
		"https://media-ice.musicradio.com/CapitalMP3#other-source",
		"https://media-ice.musicradio.com/CapitalMP3/other-source",
		"https://media-ice.musicradio.com/CapitalLondonMP3",
		"https://media-ice.musicradio.com/unknown",
	} {
		u, _ := url.Parse(raw)
		if allowedStreamURL(u) {
			t.Fatalf("untrusted redirect allowed: %s", raw)
		}
	}
}
