package onlinecover

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
)

const fixtureRelease = "ddafc115-a696-4d31-9a27-081231720ddd"

func testCatalog(t *testing.T, handler http.HandlerFunc) *Catalog {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	catalog := NewCatalog()
	catalog.musicBrainz = server.URL
	catalog.archive = server.URL
	return catalog
}

func TestSearchDistinguishesCatalogueFailuresFromNoCover(t *testing.T) {
	for _, tc := range []struct {
		name      string
		status    int
		body      string
		wantError bool
	}{
		{"unavailable", http.StatusServiceUnavailable, `upstream unavailable`, true},
		{"malformed", http.StatusOK, `not JSON`, true},
		{"missing images field", http.StatusOK, `{}`, true},
		{"empty response", http.StatusOK, ``, true},
		{"not found", http.StatusNotFound, ``, false},
		{"no front", http.StatusOK, `{"images":[{"front":false}]}`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var mbCalls int
			c := testCatalog(t, func(w http.ResponseWriter, r *http.Request) {
				if strings.HasPrefix(r.URL.Path, "/ws/") {
					mbCalls++
					_, _ = io.WriteString(w, `{"releases":[]}`)
					return
				}
				w.WriteHeader(tc.status)
				_, _ = io.WriteString(w, tc.body)
			})
			result, err := c.Search(t.Context(), "Evening jazz", fixtureRelease)
			if tc.wantError {
				if !errors.Is(err, ErrUnavailable) || mbCalls != 0 {
					t.Fatalf("failure reported as no results: %v %+v calls=%d", err, result, mbCalls)
				}
			} else if err != nil || len(result) != 0 || mbCalls != 1 {
				t.Fatalf("no front did not fall back to search: %v %+v", err, result)
			}
		})
	}
}

func TestSearchBoundsCandidatesAndFrontChecks(t *testing.T) {
	var inFlight, peak, frontCalls atomic.Int32
	c := testCatalog(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") != userAgent {
			t.Error("missing catalogue identification")
		}
		if strings.HasPrefix(r.URL.Path, "/ws/") {
			if r.URL.Query().Get("query") != `release:"Evening" AND artist:"Jazz"` || r.URL.Query().Get("limit") != "8" || r.URL.Query().Get("fmt") != "json" {
				t.Error("wrong query")
			}
			releases := make([]map[string]any, 24)
			for i := range releases {
				releases[i] = map[string]any{"id": uuid.NewString(), "title": "Evening", "date": "2026-01-01", "artist-credit": []any{map[string]string{"name": "Quartet"}}}
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"releases": releases})
			return
		}
		active := inFlight.Add(1)
		defer inFlight.Add(-1)
		frontCalls.Add(1)
		for {
			previous := peak.Load()
			if active <= previous || peak.CompareAndSwap(previous, active) {
				break
			}
		}
		timer := time.NewTimer(15 * time.Millisecond)
		defer timer.Stop()
		select {
		case <-timer.C:
		case <-r.Context().Done():
			return
		}
		_, _ = io.WriteString(w, `{"images":[{"front":true}]}`)
	})
	results, err := c.Search(t.Context(), `release:"Evening" AND artist:"Jazz"`, "")
	if err != nil || len(results) != 8 || frontCalls.Load() != 8 || peak.Load() > 3 {
		t.Fatalf("unbounded catalogue lookup: %v results=%d calls=%d concurrency=%d", err, len(results), frontCalls.Load(), peak.Load())
	}
	for _, candidate := range results {
		if !strings.HasPrefix(candidate.PreviewURL, "https://coverartarchive.org/release/") || candidate.Artist != "Quartet" || candidate.Year != "2026" {
			t.Fatalf("unexpected candidate: %+v", candidate)
		}
	}
}

func TestSearchReportsAllFrontFailuresAndKeepsUsablePartialResults(t *testing.T) {
	for _, partial := range []bool{false, true} {
		t.Run(map[bool]string{false: "all fail", true: "partial"}[partial], func(t *testing.T) {
			other := uuid.NewString()
			c := testCatalog(t, func(w http.ResponseWriter, r *http.Request) {
				if strings.HasPrefix(r.URL.Path, "/ws/") {
					_ = json.NewEncoder(w).Encode(map[string]any{"releases": []any{map[string]string{"id": fixtureRelease, "title": "Fixture"}, map[string]string{"id": other}}})
					return
				}
				if partial && strings.Contains(r.URL.Path, fixtureRelease) {
					_, _ = io.WriteString(w, `{"images":[{"front":true}]}`)
					return
				}
				w.WriteHeader(http.StatusServiceUnavailable)
			})
			results, err := c.Search(t.Context(), "fixture", "")
			if partial {
				if err != nil || len(results) != 1 || results[0].ID != fixtureRelease {
					t.Fatalf("usable result discarded: %v %+v", err, results)
				}
			} else if !errors.Is(err, ErrUnavailable) {
				t.Fatalf("all failures mistaken for empty catalogue: %v", err)
			}
		})
	}
}

func TestSearchRateLimitDoesNotQueueOrExtendWait(t *testing.T) {
	c := NewCatalog()
	if err := c.reserveSearch(t.Context()); err != nil {
		t.Fatal(err)
	}
	reserved := c.nextSearch
	for range 1000 {
		if err := c.reserveSearch(t.Context()); !errors.Is(err, ErrBusy) {
			t.Fatalf("search queued instead of busy: %v", err)
		}
	}
	if !c.nextSearch.Equal(reserved) {
		t.Fatal("rejected searches extended the next request time")
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if err := c.reserveSearch(ctx); !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled request accepted")
	}
}

func TestSearchBoundsSimultaneousRequests(t *testing.T) {
	started := make(chan struct{}, 2)
	release := make(chan struct{})
	c := testCatalog(t, func(w http.ResponseWriter, r *http.Request) {
		started <- struct{}{}
		select {
		case <-release:
		case <-r.Context().Done():
			return
		}
		_, _ = io.WriteString(w, `{"images":[{"front":true}]}`)
	})
	var workers sync.WaitGroup
	for range 2 {
		workers.Add(1)
		go func() { defer workers.Done(); _, _ = c.Search(t.Context(), "Fixture", fixtureRelease) }()
	}
	<-started
	<-started
	_, err := c.Search(t.Context(), "third", fixtureRelease)
	close(release)
	workers.Wait()
	if !errors.Is(err, ErrBusy) {
		t.Fatalf("unbounded simultaneous requests: %v", err)
	}
}

func fixturePNG(t *testing.T) []byte {
	t.Helper()
	var buffer bytes.Buffer
	im := image.NewRGBA(image.Rect(0, 0, 3, 2))
	im.Set(0, 0, color.RGBA{R: 255, A: 255})
	if err := png.Encode(&buffer, im); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func TestDownloadValidatesAndReencodesBoundedImages(t *testing.T) {
	oversizedDimensions := append([]byte(nil), fixturePNG(t)...)
	binary.BigEndian.PutUint32(oversizedDimensions[16:20], 8000)
	binary.BigEndian.PutUint32(oversizedDimensions[20:24], 8000)
	binary.BigEndian.PutUint32(oversizedDimensions[29:33], crc32.ChecksumIEEE(oversizedDimensions[12:29]))
	for _, tc := range []struct {
		name string
		data []byte
		want error
	}{
		{"valid PNG", fixturePNG(t), nil},
		{"invalid image", []byte(`<svg onload="alert(1)"/>`), ErrInvalidSelection},
		{"huge dimensions", oversizedDimensions, ErrInvalidSelection},
		{"over byte limit", bytes.Repeat([]byte{'x'}, maxImageBytes+1), ErrUnavailable},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c := testCatalog(t, func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/release/"+fixtureRelease+"/front-500" {
					t.Error("download path")
				}
				_, _ = w.Write(tc.data)
			})
			data, err := c.Download(t.Context(), fixtureRelease)
			if tc.want != nil {
				if !errors.Is(err, tc.want) {
					t.Fatalf("invalid download accepted: %v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			cfg, err := jpeg.DecodeConfig(bytes.NewReader(data))
			if err != nil || cfg.Width != 3 || cfg.Height != 2 {
				t.Fatalf("not reencoded JPEG: %v %+v", err, cfg)
			}
		})
	}
	c := NewCatalog()
	if _, err := c.Download(t.Context(), "../../secret"); !errors.Is(err, ErrInvalidSelection) {
		t.Fatal("non-release identifier accepted")
	}
}

func TestCoverRedirectsStayOnFixedHTTPSArchiveHosts(t *testing.T) {
	for _, raw := range []string{"http://archive.org/image.jpg", "https://archive.org.evil.example/cover", "https://user:secret@archive.org/cover", "https://archive.org:444/cover", "https://127.0.0.1/cover", "https://musicbrainz.org/cover"} {
		target, _ := url.Parse(raw)
		if allowedImageURL(target) {
			t.Errorf("allowed redirect %s", raw)
		}
	}
	for _, raw := range []string{"https://coverartarchive.org/release/x/front", "https://archive.org/image.jpg", "https://ia802803.us.archive.org/image.jpg"} {
		req, _ := http.NewRequest(http.MethodGet, raw, nil)
		if err := coverRedirect(req, nil); err != nil {
			t.Errorf("refused archive %s", raw)
		}
	}
	req, _ := http.NewRequest(http.MethodGet, "https://archive.org/cover", nil)
	if err := coverRedirect(req, make([]*http.Request, 5)); !errors.Is(err, ErrInvalidSelection) {
		t.Fatal("unbounded redirects")
	}
	var targetCalls atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { targetCalls.Add(1) }))
	defer target.Close()
	c := testCatalog(t, func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, http.StatusFound) })
	if _, err := c.Download(t.Context(), fixtureRelease); !errors.Is(err, ErrUnavailable) || targetCalls.Load() != 0 {
		t.Fatal("followed untrusted redirect")
	}
}
