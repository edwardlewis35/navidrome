package core

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"strings"

	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/utils"
)

const aiSettingsProperty = "cloud_music_ai_settings"
const aiCredentialsKeyFile = ".ai-credentials-key"

type AIMusicSettings struct {
	Enabled       bool   `json:"enabled"`
	Endpoint      string `json:"endpoint"`
	Model         string `json:"model"`
	KeyConfigured bool   `json:"keyConfigured"`
}

type AIMusicSettingsUpdate struct {
	Enabled  bool   `json:"enabled"`
	Endpoint string `json:"endpoint"`
	Model    string `json:"model"`
	APIKey   string `json:"apiKey"`
	ClearKey bool   `json:"clearKey"`
}

type aiStoredSettings struct {
	Enabled      bool   `json:"enabled"`
	Endpoint     string `json:"endpoint"`
	Model        string `json:"model"`
	EncryptedKey string `json:"encryptedKey,omitempty"`
	APIKey       string `json:"-"`
}

func (s *AIMusic) loadSettings(ctx context.Context) (aiStoredSettings, error) {
	value, err := s.ds.Property().Get(ctx, aiSettingsProperty)
	if errors.Is(err, model.ErrNotFound) {
		return aiStoredSettings{}, nil
	}
	if err != nil {
		return aiStoredSettings{}, err
	}
	var settings aiStoredSettings
	if err := json.Unmarshal([]byte(value), &settings); err != nil {
		return aiStoredSettings{}, ErrAIInvalidSettings
	}
	return settings, nil
}

func aiPublicSettings(settings aiStoredSettings) AIMusicSettings {
	return AIMusicSettings{Enabled: settings.Enabled, Endpoint: settings.Endpoint, Model: settings.Model, KeyConfigured: settings.EncryptedKey != ""}
}

func (s *AIMusic) Settings(ctx context.Context) (AIMusicSettings, error) {
	if _, err := aiUser(ctx, true); err != nil {
		return AIMusicSettings{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	settings, err := s.loadSettings(ctx)
	return aiPublicSettings(settings), err
}

func (s *AIMusic) UpdateSettings(ctx context.Context, update AIMusicSettingsUpdate) (AIMusicSettings, error) {
	if _, err := aiUser(ctx, true); err != nil {
		return AIMusicSettings{}, err
	}
	update.Endpoint = strings.TrimSpace(update.Endpoint)
	update.Model = strings.TrimSpace(update.Model)
	update.APIKey = strings.TrimSpace(update.APIKey)
	if len(update.Model) > 128 || strings.ContainsAny(update.Model, "\r\n") || len(update.APIKey) > 8192 || strings.ContainsAny(update.APIKey, "\r\n") || (update.ClearKey && update.APIKey != "") {
		return AIMusicSettings{}, ErrAIInvalidSettings
	}
	if update.Endpoint != "" {
		if _, err := validateAIEndpoint(update.Endpoint); err != nil {
			return AIMusicSettings{}, err
		}
	}
	if update.Enabled && (update.Endpoint == "" || update.Model == "") {
		return AIMusicSettings{}, ErrAIInvalidSettings
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	previous, err := s.loadSettings(ctx)
	if err != nil {
		return AIMusicSettings{}, err
	}
	// Never silently send a saved credential to a newly configured provider.
	if previous.Endpoint != update.Endpoint && previous.EncryptedKey != "" && update.APIKey == "" && !update.ClearKey {
		return AIMusicSettings{}, ErrAIInvalidSettings
	}
	settings := aiStoredSettings{Enabled: update.Enabled, Endpoint: update.Endpoint, Model: update.Model, EncryptedKey: previous.EncryptedKey}
	if update.ClearKey {
		settings.EncryptedKey = ""
	}
	if update.APIKey != "" {
		key, err := s.credentialsKey(true)
		if err != nil {
			return AIMusicSettings{}, err
		}
		settings.EncryptedKey, err = utils.Encrypt(ctx, key, update.APIKey)
		if err != nil {
			return AIMusicSettings{}, err
		}
	}
	encoded, err := json.Marshal(settings)
	if err != nil {
		return AIMusicSettings{}, err
	}
	if err := s.ds.Property().Put(ctx, aiSettingsProperty, string(encoded)); err != nil {
		return AIMusicSettings{}, err
	}
	return aiPublicSettings(settings), nil
}

func (s *AIMusic) credentialsKey(create bool) ([]byte, error) {
	root, err := os.OpenRoot(s.dataFolder)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if _, err := root.Lstat(aiCredentialsKeyFile); errors.Is(err, os.ErrNotExist) && create {
		key := make([]byte, 32)
		if _, err := rand.Read(key); err != nil {
			return nil, err
		}
		var nonce [16]byte
		if _, err := rand.Read(nonce[:]); err != nil {
			return nil, err
		}
		temporary := aiCredentialsKeyFile + "." + hex.EncodeToString(nonce[:])
		file, err := root.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err != nil {
			return nil, err
		}
		defer func() { _ = root.Remove(temporary) }()
		_, writeErr := file.Write(key)
		if writeErr == nil {
			writeErr = file.Sync()
		}
		closeErr := file.Close()
		if writeErr != nil {
			return nil, writeErr
		}
		if closeErr != nil {
			return nil, closeErr
		}
		// A hard link publishes complete bytes atomically and refuses any pre-existing name.
		if err := root.Link(temporary, aiCredentialsKeyFile); err != nil && !errors.Is(err, os.ErrExist) {
			return nil, err
		}
		directory, err := root.Open(".")
		if err != nil {
			return nil, err
		}
		syncErr := trashSyncDirectory(directory)
		closeErr = directory.Close()
		if syncErr != nil {
			return nil, syncErr
		}
		if closeErr != nil {
			return nil, closeErr
		}
	}
	info, err := root.Lstat(aiCredentialsKeyFile)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() != 32 {
		return nil, ErrAIInvalidSettings
	}
	file, err := root.Open(aiCredentialsKeyFile)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	key, err := io.ReadAll(io.LimitReader(file, 33))
	if err != nil {
		return nil, err
	}
	if len(key) != 32 {
		return nil, ErrAIInvalidSettings
	}
	return key, nil
}

func (s *AIMusic) decryptKey(ctx context.Context, encrypted string) (string, error) {
	if encrypted == "" {
		return "", nil
	}
	key, err := s.credentialsKey(false)
	if err != nil {
		return "", ErrAINotConfigured
	}
	value, err := utils.Decrypt(ctx, key, encrypted)
	if err != nil {
		return "", ErrAINotConfigured
	}
	return value, nil
}
