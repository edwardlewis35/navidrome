package onlinecover

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "golang.org/x/image/webp"
)

var ErrUnavailable = errors.New("cover catalogue unavailable")
var ErrInvalidSelection = errors.New("invalid cover selection")
var ErrBusy = errors.New("cover catalogue is busy; try again shortly")

const userAgent = "CloudMusicNavidrome/1.0 (https://github.com/edwardlewis35/navidrome)"
const maxImageBytes = 5 << 20

type Candidate struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Artist     string `json:"artist"`
	Year       string `json:"year,omitempty"`
	PreviewURL string `json:"previewUrl"`
	SourceURL  string `json:"sourceUrl"`
	Source     string `json:"source"`
}

type Catalog struct {
	client      *http.Client
	musicBrainz string
	archive     string
	mu          sync.Mutex
	nextSearch  time.Time
	searches    chan struct{}
	frontChecks chan struct{}
	downloads   chan struct{}
}

func NewCatalog() *Catalog {
	return &Catalog{client: &http.Client{Timeout: 12 * time.Second, CheckRedirect: coverRedirect}, musicBrainz: "https://musicbrainz.org", archive: "https://coverartarchive.org", searches: make(chan struct{}, 2), frontChecks: make(chan struct{}, 3), downloads: make(chan struct{}, 2)}
}

func coverRedirect(req *http.Request, previous []*http.Request) error {
	if len(previous) >= 5 || !allowedImageURL(req.URL) {
		return ErrInvalidSelection
	}
	req.Header.Set("User-Agent", userAgent)
	return nil
}

func allowedImageURL(u *url.URL) bool {
	host := strings.ToLower(u.Hostname())
	return u.Scheme == "https" && u.User == nil && (u.Port() == "" || u.Port() == "443") && (host == "coverartarchive.org" || host == "archive.org" || strings.HasSuffix(host, ".archive.org"))
}

func ValidReleaseID(id string) bool { _, err := uuid.Parse(id); return err == nil && len(id) == 36 }

// MusicBrainz asks each client IP to stay at or below one search per second.
func (c *Catalog) reserveSearch(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	if now.Before(c.nextSearch) {
		return ErrBusy
	}
	c.nextSearch = now.Add(time.Second)
	return nil
}

func (c *Catalog) get(ctx context.Context, target string, limit int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/json")
	res, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: network request failed", ErrUnavailable)
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: provider status %d", ErrUnavailable, res.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if err != nil || int64(len(data)) > limit {
		return nil, fmt.Errorf("%w: invalid provider response", ErrUnavailable)
	}
	return data, nil
}

func (c *Catalog) hasFront(ctx context.Context, id string) (bool, error) {
	select {
	case c.frontChecks <- struct{}{}:
		defer func() { <-c.frontChecks }()
	case <-ctx.Done():
		return false, ctx.Err()
	}
	data, err := c.get(ctx, c.archive+"/release/"+id, 512<<10)
	if err != nil {
		return false, err
	}
	if data == nil {
		return false, nil
	}
	var result struct {
		Images []struct {
			Front bool `json:"front"`
		} `json:"images"`
	}
	if json.Unmarshal(data, &result) != nil || result.Images == nil {
		return false, ErrUnavailable
	}
	for _, im := range result.Images {
		if im.Front {
			return true, nil
		}
	}
	return false, nil
}

func (c *Catalog) candidate(id, title, artist, year string) Candidate {
	return Candidate{ID: id, Title: title, Artist: artist, Year: year, PreviewURL: "https://coverartarchive.org/release/" + id + "/front-250", SourceURL: "https://musicbrainz.org/release/" + id, Source: "MusicBrainz / Cover Art Archive"}
}

type catalogRelease struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Date         string `json:"date"`
	ArtistCredit []struct {
		Name   string `json:"name"`
		Artist struct {
			Name string `json:"name"`
		} `json:"artist"`
	} `json:"artist-credit"`
}

// Search sends names only. Clients cannot supply provider URLs or filesystem paths.
func (c *Catalog) Search(ctx context.Context, query, releaseID string) ([]Candidate, error) {
	select {
	case c.searches <- struct{}{}:
		defer func() { <-c.searches }()
	default:
		return nil, ErrBusy
	}
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	if ValidReleaseID(releaseID) {
		found, err := c.hasFront(ctx, releaseID)
		if err != nil {
			return nil, err
		}
		if found {
			return []Candidate{c.candidate(releaseID, query, "", "")}, nil
		}
	}
	query = strings.TrimSpace(query)
	if query == "" || len([]rune(query)) > 512 {
		return nil, ErrInvalidSelection
	}
	if err := c.reserveSearch(ctx); err != nil {
		return nil, err
	}
	releases, err := c.searchReleases(ctx, query)
	if err != nil {
		return nil, err
	}
	return c.availableCandidates(ctx, releases)
}

func (c *Catalog) searchReleases(ctx context.Context, query string) ([]catalogRelease, error) {
	u, err := url.Parse(c.musicBrainz + "/ws/2/release/")
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("query", query)
	q.Set("fmt", "json")
	q.Set("limit", "8")
	u.RawQuery = q.Encode()
	data, err := c.get(ctx, u.String(), 1<<20)
	if err != nil {
		return nil, err
	}
	var response struct {
		Releases []catalogRelease `json:"releases"`
	}
	if json.Unmarshal(data, &response) != nil || response.Releases == nil {
		return nil, ErrUnavailable
	}
	// Enforce our own bound even when an upstream ignores the limit parameter.
	if len(response.Releases) > 8 {
		response.Releases = response.Releases[:8]
	}
	return response.Releases, nil
}

func (c *Catalog) availableCandidates(ctx context.Context, releases []catalogRelease) ([]Candidate, error) {
	available := make([]bool, len(releases))
	failures := make([]error, len(releases))
	var workers sync.WaitGroup
	for i, release := range releases {
		if !ValidReleaseID(release.ID) {
			continue
		}
		workers.Add(1)
		go func(i int, id string) {
			defer workers.Done()
			available[i], failures[i] = c.hasFront(ctx, id)
		}(i, release.ID)
	}
	workers.Wait()
	result := make([]Candidate, 0, len(releases))
	seen := make(map[string]bool)
	for i, release := range releases {
		if !available[i] || seen[release.ID] {
			continue
		}
		seen[release.ID] = true
		result = append(result, c.candidateForRelease(release))
	}
	if len(result) == 0 {
		for _, err := range failures {
			if err != nil {
				return nil, ErrUnavailable
			}
		}
		if ctx.Err() != nil {
			return nil, ErrUnavailable
		}
	}
	return result, nil
}

func (c *Catalog) candidateForRelease(release catalogRelease) Candidate {
	var names []string
	for _, credit := range release.ArtistCredit {
		name := credit.Name
		if name == "" {
			name = credit.Artist.Name
		}
		if name != "" {
			names = append(names, name)
		}
	}
	year := release.Date
	if len(year) > 4 {
		year = year[:4]
	}
	return c.candidate(release.ID, release.Title, strings.Join(names, ", "), year)
}

// Download accepts a catalogue release ID only and re-encodes a bounded image.
func (c *Catalog) Download(ctx context.Context, releaseID string) ([]byte, error) {
	if !ValidReleaseID(releaseID) {
		return nil, ErrInvalidSelection
	}
	select {
	case c.downloads <- struct{}{}:
		defer func() { <-c.downloads }()
	default:
		return nil, ErrBusy
	}
	data, err := c.get(ctx, c.archive+"/release/"+releaseID+"/front-500", maxImageBytes)
	if err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return nil, ErrUnavailable
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width > 16000000/cfg.Height {
		return nil, ErrInvalidSelection
	}
	im, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, ErrInvalidSelection
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, im, &jpeg.Options{Quality: 90}); err != nil {
		return nil, err
	}
	return encoded.Bytes(), nil
}
