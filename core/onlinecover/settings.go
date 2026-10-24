package onlinecover

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sync"

	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
)

const settingsProperty = "cloud_music_online_cover_settings"

// Settings reports the effective dedicated proxy; saved empty values mean direct.
type Settings struct {
	Proxy  string `json:"proxy"`
	Source string `json:"source"`
}

type catalogSettings struct {
	mu     sync.Mutex
	repo   model.PropertyRepository
	loaded bool
	value  Settings
}

// NewStoredCatalog keeps the same catalogue and rate limits across settings updates.
func NewStoredCatalog(repo model.PropertyRepository, serverProxy string) *Catalog {
	c := newCatalog(serverProxy)
	c.settings = &catalogSettings{repo: repo, value: Settings{Proxy: serverProxy, Source: "server"}}
	return c
}

func (c *Catalog) httpClient() (*http.Client, error) {
	c.clientMu.RLock()
	defer c.clientMu.RUnlock()
	return c.client, c.setupErr
}

func (c *Catalog) installClient(client *http.Client) {
	c.clientMu.Lock()
	previous := c.client
	c.client, c.setupErr = client, nil
	c.clientMu.Unlock()
	if previous != nil && previous.Transport != nil {
		previous.CloseIdleConnections()
	}
}

func savedProxyClient(proxy string) (*http.Client, error) {
	if len(proxy) > 2048 {
		return nil, ErrInvalidSelection
	}
	client, err := catalogClient(proxy)
	if err != nil {
		return nil, ErrInvalidSelection
	}
	if proxy == "" {
		// An explicit direct setting must also bypass proxy environment variables.
		base, ok := http.DefaultTransport.(*http.Transport)
		if !ok {
			return nil, ErrUnavailable
		}
		transport := base.Clone()
		transport.Proxy = nil
		client.Transport = transport
	}
	return client, nil
}

func (c *Catalog) loadSettingsLocked(ctx context.Context) error {
	s := c.settings
	if s.loaded {
		return nil
	}
	value, err := s.repo.Get(ctx, settingsProperty)
	if errors.Is(err, model.ErrNotFound) {
		if len(s.value.Proxy) > 2048 {
			return ErrUnavailable
		}
		if _, err := c.httpClient(); err != nil {
			return err
		}
		s.loaded = true
		return nil
	}
	if err != nil {
		return err
	}
	var saved struct {
		Proxy *string `json:"proxy"`
	}
	if err := json.Unmarshal([]byte(value), &saved); err != nil || saved.Proxy == nil {
		return ErrUnavailable
	}
	client, err := savedProxyClient(*saved.Proxy)
	if err != nil {
		return ErrUnavailable
	}
	c.installClient(client)
	s.value = Settings{Proxy: *saved.Proxy, Source: "saved"}
	s.loaded = true
	return nil
}

func (c *Catalog) loadSettings(ctx context.Context) error {
	if c.settings == nil {
		return nil
	}
	c.settings.mu.Lock()
	defer c.settings.mu.Unlock()
	return c.loadSettingsLocked(ctx)
}

func settingsAdmin(ctx context.Context) error {
	user, ok := request.UserFrom(ctx)
	if !ok || user.ID == "" || !user.IsAdmin {
		return model.ErrNotAuthorized
	}
	return nil
}

func (c *Catalog) Settings(ctx context.Context) (Settings, error) {
	if err := settingsAdmin(ctx); err != nil {
		return Settings{}, err
	}
	if c.settings == nil {
		return Settings{}, ErrUnavailable
	}
	c.settings.mu.Lock()
	defer c.settings.mu.Unlock()
	if err := c.loadSettingsLocked(ctx); err != nil {
		return Settings{}, err
	}
	return c.settings.value, nil
}

func (c *Catalog) UpdateSettings(ctx context.Context, proxy string) (Settings, error) {
	if err := settingsAdmin(ctx); err != nil {
		return Settings{}, err
	}
	if c.settings == nil {
		return Settings{}, ErrUnavailable
	}
	client, err := savedProxyClient(proxy)
	if err != nil {
		return Settings{}, err
	}
	c.settings.mu.Lock()
	defer c.settings.mu.Unlock()
	encoded, err := json.Marshal(struct {
		Proxy string `json:"proxy"`
	}{Proxy: proxy})
	if err != nil {
		return Settings{}, err
	}
	if err := c.settings.repo.Put(ctx, settingsProperty, string(encoded)); err != nil {
		client.CloseIdleConnections()
		return Settings{}, err
	}
	c.installClient(client)
	c.settings.value = Settings{Proxy: proxy, Source: "saved"}
	c.settings.loaded = true
	return c.settings.value, nil
}
