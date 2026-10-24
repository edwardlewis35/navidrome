// Package englishradio relays a small curated catalogue of public English radio
// streams. Only its own HTTP transport follows the administrator's radio proxy.
package englishradio

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
)

var (
	ErrUnauthorized    = errors.New("radio authentication required")
	ErrForbidden       = errors.New("radio administrator required")
	ErrInvalidSettings = errors.New("invalid radio proxy settings")
	ErrUnavailable     = errors.New("radio stream unavailable")
	ErrBusy            = errors.New("radio is busy")
)

const settingsProperty = "cloud_music_english_radio_settings"
const TicketLifetime = 15 * time.Minute
const maxTickets = 512

type Station struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	HomePageURL string `json:"homePageUrl"`
	SourceURL   string `json:"sourceUrl"`
	streamURL   string
}

// These fixed broadcaster URLs are the only possible relay destinations.
var stations = []Station{
	{ID: "heart-london", Name: "Heart London", Description: "London · pop and feel-good hits", HomePageURL: "https://www.heart.co.uk/london/", SourceURL: "https://www.heart.co.uk/radio/how-to-listen/getting-started/", streamURL: "https://media-ice.musicradio.com/HeartLondonMP3"},
	{ID: "lbc-news", Name: "LBC News UK", Description: "United Kingdom · news and current affairs", HomePageURL: "https://www.lbc.co.uk/news/", SourceURL: "https://www.lbc.co.uk/radio/how-to-listen/", streamURL: "https://media-ice.musicradio.com/LBCUKMP3"},
	{ID: "classic-fm", Name: "Classic FM", Description: "United Kingdom · classical music", HomePageURL: "https://www.classicfm.com/", SourceURL: "https://www.classicfm.com/radio/how-to-listen/", streamURL: "https://media-ice.musicradio.com/ClassicFMMP3"},
}

type Settings struct {
	Proxy string `json:"proxy"`
}

type ticket struct {
	userID    string
	stationID string
	epoch     int
	expires   time.Time
}

type Service struct {
	properties model.PropertyRepository
	users      model.UserRepository
	mu         sync.Mutex
	loaded     bool
	settings   Settings
	client     *http.Client
	tickets    map[string]ticket
	active     map[string]int
	streams    chan struct{}
}

func New(properties model.PropertyRepository, users model.UserRepository) *Service {
	client, _ := radioClient("")
	return &Service{properties: properties, users: users, client: client, tickets: make(map[string]ticket), active: make(map[string]int), streams: make(chan struct{}, 16)}
}

func Catalog() []Station { return append([]Station(nil), stations...) }

func findStation(id string) (Station, bool) {
	for _, station := range stations {
		if station.ID == id {
			return station, true
		}
	}
	return Station{}, false
}

func radioClient(proxy string) (*http.Client, error) {
	if len(proxy) > 2048 {
		return nil, ErrInvalidSettings
	}
	base, ok := http.DefaultTransport.(*http.Transport)
	if !ok {
		return nil, ErrUnavailable
	}
	transport := base.Clone()
	transport.Proxy = nil
	transport.DialContext = (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext
	transport.TLSHandshakeTimeout = 10 * time.Second
	transport.ResponseHeaderTimeout = 15 * time.Second
	transport.DisableCompression = true
	if proxy != "" {
		u, err := url.Parse(proxy)
		if err != nil || u == nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || strings.Contains(proxy, "#") || u.Opaque != "" {
			return nil, ErrInvalidSettings
		}
		port, err := strconv.Atoi(u.Port())
		if err != nil || port < 1 || port > 65535 {
			return nil, ErrInvalidSettings
		}
		transport.Proxy = http.ProxyURL(u)
	}
	return &http.Client{Transport: transport, CheckRedirect: func(req *http.Request, previous []*http.Request) error {
		if len(previous) >= 4 || !allowedStreamURL(req.URL) {
			return ErrUnavailable
		}
		req.Header.Set("User-Agent", "CloudMusicNavidrome/1.0 (English radio)")
		return nil
	}}, nil
}

func allowedStreamURL(u *url.URL) bool {
	if u == nil || u.Scheme != "https" || u.User != nil || (u.Port() != "" && u.Port() != "443") || u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	if u.Hostname() != "media-ice.musicradio.com" && u.Hostname() != "icecast.thisisdax.com" {
		return false
	}
	return u.Path == "/HeartLondonMP3" || u.Path == "/LBCUKMP3" || u.Path == "/ClassicFMMP3"
}

func (s *Service) loadLocked(ctx context.Context) error {
	if s.loaded {
		return nil
	}
	value, err := s.properties.Get(ctx, settingsProperty)
	if errors.Is(err, model.ErrNotFound) {
		if s.client == nil {
			return ErrUnavailable
		}
		s.loaded = true
		return nil
	}
	if err != nil {
		return err
	}
	var settings Settings
	if json.Unmarshal([]byte(value), &settings) != nil {
		return ErrUnavailable
	}
	client, err := radioClient(settings.Proxy)
	if err != nil {
		return ErrUnavailable
	}
	s.client, s.settings, s.loaded = client, settings, true
	return nil
}

func admin(ctx context.Context) error {
	u, ok := request.UserFrom(ctx)
	if !ok || u.ID == "" {
		return ErrUnauthorized
	}
	if !u.IsAdmin {
		return ErrForbidden
	}
	return nil
}

func (s *Service) Settings(ctx context.Context) (Settings, error) {
	if err := admin(ctx); err != nil {
		return Settings{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.loadLocked(ctx); err != nil {
		return Settings{}, err
	}
	return s.settings, nil
}

func (s *Service) UpdateSettings(ctx context.Context, proxy string) (Settings, error) {
	if err := admin(ctx); err != nil {
		return Settings{}, err
	}
	client, err := radioClient(proxy)
	if err != nil {
		return Settings{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	settings := Settings{Proxy: proxy}
	encoded, err := json.Marshal(settings)
	if err != nil {
		return Settings{}, err
	}
	if err := s.properties.Put(ctx, settingsProperty, string(encoded)); err != nil {
		client.CloseIdleConnections()
		return Settings{}, err
	}
	previous := s.client
	s.client, s.settings, s.loaded = client, settings, true
	if previous != nil {
		previous.CloseIdleConnections()
	}
	return settings, nil
}

// Ticket creates a short-lived capability for a single fixed station. Its value
// travels only in an HttpOnly, station-scoped cookie, never a URL or JSON body.
func (s *Service) Ticket(ctx context.Context, stationID string) (string, error) {
	u, ok := request.UserFrom(ctx)
	if !ok || u.ID == "" {
		return "", ErrUnauthorized
	}
	if _, ok := findStation(stationID); !ok {
		return "", model.ErrNotFound
	}
	var random [32]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", ErrUnavailable
	}
	value := base64.RawURLEncoding.EncodeToString(random[:])
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	for key, old := range s.tickets {
		if old.expires.Before(now) || (old.userID == u.ID && old.stationID == stationID) {
			delete(s.tickets, key)
		}
	}
	if len(s.tickets) >= maxTickets {
		return "", ErrBusy
	}
	s.tickets[value] = ticket{userID: u.ID, stationID: stationID, epoch: u.TokenEpoch, expires: now.Add(TicketLifetime)}
	return value, nil
}

// Open checks the narrow capability and live user epoch before connecting. The
// request context closes the broadcaster connection when the player disconnects.
func (s *Service) Open(ctx context.Context, stationID, value string) (io.ReadCloser, string, error) {
	station, ok := findStation(stationID)
	if !ok {
		return nil, "", model.ErrNotFound
	}
	s.mu.Lock()
	t, ok := s.tickets[value]
	if !ok || t.stationID != stationID || !t.expires.After(time.Now()) {
		s.mu.Unlock()
		return nil, "", ErrUnauthorized
	}
	if s.active[t.userID] >= 2 {
		s.mu.Unlock()
		return nil, "", ErrBusy
	}
	select {
	case s.streams <- struct{}{}:
	default:
		s.mu.Unlock()
		return nil, "", ErrBusy
	}
	s.active[t.userID]++
	err := s.loadLocked(ctx)
	client := s.client
	s.mu.Unlock()
	release := func() {
		s.mu.Lock()
		s.active[t.userID]--
		if s.active[t.userID] == 0 {
			delete(s.active, t.userID)
		}
		s.mu.Unlock()
		<-s.streams
	}
	if err != nil {
		release()
		return nil, "", ErrUnavailable
	}
	u, err := s.users.Get(ctx, t.userID)
	if err != nil || u.TokenEpoch != t.epoch {
		release()
		return nil, "", ErrUnauthorized
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, station.streamURL, nil)
	if err != nil {
		release()
		return nil, "", ErrUnavailable
	}
	req.Header.Set("User-Agent", "CloudMusicNavidrome/1.0 (English radio)")
	req.Header.Set("Icy-MetaData", "0")
	req.Header.Set("Accept", "audio/mpeg, audio/aac, audio/aacp")
	res, err := client.Do(req)
	if err != nil {
		release()
		return nil, "", ErrUnavailable
	}
	contentType, _, _ := mime.ParseMediaType(res.Header.Get("Content-Type"))
	if res.StatusCode != http.StatusOK || (contentType != "audio/mpeg" && contentType != "audio/aac" && contentType != "audio/aacp") {
		_ = res.Body.Close()
		release()
		return nil, "", ErrUnavailable
	}
	return &streamBody{ReadCloser: res.Body, release: release}, contentType, nil
}

type streamBody struct {
	io.ReadCloser
	once    sync.Once
	release func()
}

func (b *streamBody) Close() error { err := b.ReadCloser.Close(); b.once.Do(b.release); return err }
