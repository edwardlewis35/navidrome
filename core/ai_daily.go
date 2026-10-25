package core

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/Masterminds/squirrel"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
)

const aiDailyPropertyPrefix = "cloud_music_ai_daily_"
const aiDailyCount = 6
const aiDailyMaxCacheBytes = 64 << 10

// AIDailyRecommendations is a read-only view of a persisted background result.
type AIDailyRecommendations struct {
	AIRecommendations
	Configured         bool       `json:"configured"`
	State              string     `json:"state"`
	Date               string     `json:"date"`
	GeneratedAt        *time.Time `json:"generatedAt,omitempty"`
	Stale              bool       `json:"stale"`
	NextRunAt          time.Time  `json:"nextRunAt"`
	SourcePlaylistName string     `json:"sourcePlaylistName,omitempty"`
}

type aiDailyLocal struct {
	ID     string `json:"id"`
	Reason string `json:"reason"`
}

// The cache stores local identities rather than file records or playback URLs.
type aiDailyStored struct {
	AttemptDate      string                     `json:"attemptDate"`
	AttemptConfig    string                     `json:"attemptConfig"`
	AttemptScope     string                     `json:"attemptScope"`
	AttemptID        string                     `json:"attemptId"`
	AttemptStartedAt time.Time                  `json:"attemptStartedAt"`
	AttemptState     string                     `json:"attemptState"`
	Date             string                     `json:"date,omitempty"`
	Config           string                     `json:"config,omitempty"`
	Scope            string                     `json:"scope,omitempty"`
	GeneratedAt      *time.Time                 `json:"generatedAt,omitempty"`
	PlaylistID       string                     `json:"playlistId,omitempty"`
	Analysis         string                     `json:"analysis,omitempty"`
	SourceCount      int                        `json:"sourceCount,omitempty"`
	CandidateCount   int                        `json:"candidateCount,omitempty"`
	Local            []aiDailyLocal             `json:"local,omitempty"`
	External         []AIExternalRecommendation `json:"external,omitempty"`
}

func aiDailyCalendar(now time.Time) (string, time.Time) {
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		location = time.FixedZone("Asia/Shanghai", 8*60*60)
	}
	local := now.In(location)
	boundary := time.Date(local.Year(), local.Month(), local.Day(), 3, 0, 0, 0, location)
	if local.Before(boundary) {
		return boundary.AddDate(0, 0, -1).Format(time.DateOnly), boundary
	}
	return boundary.Format(time.DateOnly), boundary.AddDate(0, 0, 1)
}

func aiDailyProperty(userID string) string {
	digest := sha256.Sum256([]byte(userID))
	return aiDailyPropertyPrefix + hex.EncodeToString(digest[:])
}

func aiDailyConfig(settings aiStoredSettings) string {
	// Only the fingerprint is persisted; neither the provider URL nor credential
	// (including its ciphertext) is copied into recommendation records.
	encoded, _ := json.Marshal(struct {
		Enabled                     bool
		Endpoint, Model, Credential string
	}{settings.Enabled, settings.Endpoint, settings.Model, settings.EncryptedKey})
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:])
}

func aiDailyScope(user model.User) string {
	ids := make([]int, 0, len(user.Libraries))
	for _, library := range user.Libraries {
		ids = append(ids, library.ID)
	}
	sort.Ints(ids)
	encoded, _ := json.Marshal(struct {
		Admin     bool
		Libraries []int
	}{user.IsAdmin, ids})
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:])
}

func loadAIDaily(ctx context.Context, properties model.PropertyRepository, userID string) (aiDailyStored, error) {
	value, err := properties.Get(ctx, aiDailyProperty(userID))
	if errors.Is(err, model.ErrNotFound) {
		return aiDailyStored{}, nil
	}
	if err != nil {
		return aiDailyStored{}, err
	}
	var stored aiDailyStored
	if len(value) > aiDailyMaxCacheBytes || json.Unmarshal([]byte(value), &stored) != nil || len(stored.Local)+len(stored.External) > aiDailyCount {
		return stored, ErrAIInvalidResponse
	}
	return stored, nil
}

func putAIDaily(ctx context.Context, properties model.PropertyRepository, userID string, stored aiDailyStored) error {
	encoded, err := json.Marshal(stored)
	if err != nil || len(encoded) > aiDailyMaxCacheBytes {
		return ErrAIInvalidResponse
	}
	return properties.Put(ctx, aiDailyProperty(userID), string(encoded))
}

// Daily never contacts the AI provider. Cached local tracks are hydrated with
// current authorization and availability instead of returning stale file data.
func (s *AIMusic) Daily(ctx context.Context, now time.Time) (*AIDailyRecommendations, error) {
	user, err := aiUser(ctx, false)
	if err != nil {
		return nil, err
	}
	date, next := aiDailyCalendar(now)
	result := &AIDailyRecommendations{AIRecommendations: AIRecommendations{
		Recommendations: []AIRecommendation{}, ExternalRecommendations: []AIExternalRecommendation{},
	}, State: "disabled", Date: date, NextRunAt: next}
	settings, err := s.providerSettings(ctx)
	if errors.Is(err, ErrAINotConfigured) || errors.Is(err, ErrAIInvalidSettings) {
		return result, nil
	}
	if err != nil {
		return nil, err
	}
	result.Configured = true
	result.State = "pending"
	stored, err := loadAIDaily(ctx, s.ds.Property(), user.ID)
	if err != nil {
		return nil, err
	}
	config := aiDailyConfig(settings)
	scope := aiDailyScope(user)
	if stored.AttemptDate == date && stored.AttemptConfig == config && stored.AttemptScope == scope {
		if stored.AttemptState == "failed" || now.Sub(stored.AttemptStartedAt) >= 2*time.Minute {
			result.State = "failed"
		}
	}
	if stored.GeneratedAt == nil || stored.PlaylistID == "" || stored.Scope != scope {
		return result, nil
	}
	playlist, err := s.ds.Playlist().Get(ctx, stored.PlaylistID)
	if errors.Is(err, model.ErrNotFound) || errors.Is(err, model.ErrNotAuthorized) || (err == nil && playlist.OwnerID != user.ID && !playlist.Public) {
		return result, nil
	}
	if err != nil {
		return nil, err
	}
	result.State, result.Date, result.GeneratedAt = "ready", stored.Date, stored.GeneratedAt
	result.Stale = stored.Date != date || stored.Config != config
	result.SourcePlaylistName = playlist.Name
	result.Analysis, result.SourceCount, result.CandidateCount = stored.Analysis, stored.SourceCount, stored.CandidateCount
	for _, pick := range stored.Local {
		track, err := s.ds.MediaFile().Get(ctx, pick.ID)
		if err != nil || track.Missing || track.Trashed || !user.HasLibraryAccess(track.LibraryID) {
			continue
		}
		result.Recommendations = append(result.Recommendations, AIRecommendation{Song: *track, Reason: pick.Reason})
	}
	for _, pick := range stored.External {
		local, err := s.hasLocalAITrack(ctx, user, pick.Title, pick.Artist)
		if err != nil {
			return nil, err
		}
		if !local {
			result.ExternalRecommendations = append(result.ExternalRecommendations, pick)
		}
	}
	return result, nil
}

// GenerateDaily is called by the service's background worker. Persisting its
// claim before the network call prevents duplicate calls after process restart.
// A corrected provider configuration gets its own claim and can recover today.
func (s *AIMusic) GenerateDaily(ctx context.Context, now time.Time) error {
	if !s.dailyMu.TryLock() {
		return ErrAIBusy
	}
	defer s.dailyMu.Unlock()
	_, err := s.providerSettings(ctx)
	if errors.Is(err, ErrAINotConfigured) || errors.Is(err, ErrAIInvalidSettings) {
		return nil
	}
	if err != nil {
		return err
	}
	users, err := s.ds.User().GetAll(ctx)
	if err != nil {
		return err
	}
	date, _ := aiDailyCalendar(now)
	var failures []error
	for _, user := range users {
		if err := ctx.Err(); err != nil {
			return err
		}
		if user.ID == "" {
			continue
		}
		settings, err := s.providerSettings(ctx)
		if errors.Is(err, ErrAINotConfigured) || errors.Is(err, ErrAIInvalidSettings) {
			break
		}
		if err != nil {
			return err
		}
		if err := s.generateAIDailyUser(request.WithUser(ctx, user), user, now, date, aiDailyConfig(settings), settings); err != nil && !errors.Is(err, ErrAIBusy) && !errors.Is(err, ErrAIEmptyPlaylist) {
			failures = append(failures, fmt.Errorf("daily AI generation for user %s: %w", user.ID, err))
		}
	}
	return errors.Join(failures...)
}

func (s *AIMusic) dailySource(ctx context.Context, user model.User, date string) (*model.Playlist, *aiRecommendationPool, error) {
	playlists, err := s.ds.Playlist().GetAll(ctx, model.QueryOptions{
		Max: 1000, Sort: "id", Order: "ASC", Filters: squirrel.Or{squirrel.Eq{"owner_id": user.ID}, squirrel.Eq{"public": true}},
	})
	if err != nil {
		return nil, nil, err
	}
	eligible := make(model.Playlists, 0, len(playlists))
	for _, playlist := range playlists {
		if playlist.OwnerID == user.ID || playlist.Public {
			eligible = append(eligible, playlist)
		}
	}
	sort.Slice(eligible, func(i, j int) bool {
		ownI, ownJ := eligible[i].OwnerID == user.ID, eligible[j].OwnerID == user.ID
		if ownI != ownJ {
			return ownI
		}
		return aiDailyRank(date, user.ID, eligible[i].ID) < aiDailyRank(date, user.ID, eligible[j].ID)
	})
	for _, playlist := range eligible {
		pool, err := s.recommendationPool(ctx, user, playlist.ID)
		if errors.Is(err, ErrAIEmptyPlaylist) || errors.Is(err, model.ErrNotFound) {
			continue
		}
		if err != nil {
			return nil, nil, err
		}
		return &playlist, pool, nil
	}
	return nil, nil, ErrAIEmptyPlaylist
}

func (s *AIMusic) generateAIDailyUser(ctx context.Context, user model.User, now time.Time, date, config string, settings aiStoredSettings) error {
	scope := aiDailyScope(user)
	stored, err := loadAIDaily(ctx, s.ds.Property(), user.ID)
	if err != nil || (stored.AttemptDate == date && stored.AttemptConfig == config && stored.AttemptScope == scope) {
		return err
	}
	playlist, pool, err := s.dailySource(ctx, user, date)
	if err != nil {
		return err
	}
	release, err := s.acquireAt(user.ID, now)
	if err != nil {
		return err
	}
	defer release()
	if err := ctx.Err(); err != nil {
		return err
	}
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return err
	}
	attemptID := hex.EncodeToString(random[:])
	claimed := false
	err = s.ds.WithTxImmediate(func(tx model.DataStore) error {
		previous, err := loadAIDaily(ctx, tx.Property(), user.ID)
		if err != nil || (previous.AttemptDate == date && previous.AttemptConfig == config && previous.AttemptScope == scope) {
			return err
		}
		previous.AttemptDate, previous.AttemptConfig, previous.AttemptID = date, config, attemptID
		previous.AttemptScope = scope
		previous.AttemptStartedAt, previous.AttemptState = now, "pending"
		if err := putAIDaily(ctx, tx.Property(), user.ID, previous); err != nil {
			return err
		}
		claimed = true
		return nil
	}, "claim daily AI generation")
	if err != nil || !claimed {
		return err
	}
	response, generationErr := s.callProvider(ctx, settings, playlist.Name, pool.Source, pool.Candidates)
	var generated *AIRecommendations
	if generationErr == nil {
		generated, generationErr = s.bindRecommendations(ctx, user, &AIRecommendations{
			Recommendations: []AIRecommendation{}, ExternalRecommendations: []AIExternalRecommendation{},
			SourceCount: len(pool.Source), CandidateCount: len(pool.Candidates),
		}, response, pool.Local, pool.Source)
	}
	if generated != nil {
		selectAIDaily(generated, date, user.ID)
	}
	persistErr := s.ds.WithTxImmediate(func(tx model.DataStore) error {
		current, err := loadAIDaily(ctx, tx.Property(), user.ID)
		if err != nil || current.AttemptID != attemptID {
			return err
		}
		current.AttemptState = "failed"
		if generationErr == nil {
			current.AttemptState = "ready"
			current.Date, current.Config, current.GeneratedAt, current.PlaylistID = date, config, &now, playlist.ID
			current.Scope = scope
			current.Analysis, current.SourceCount, current.CandidateCount = generated.Analysis, generated.SourceCount, generated.CandidateCount
			current.Local = make([]aiDailyLocal, 0, len(generated.Recommendations))
			for _, pick := range generated.Recommendations {
				current.Local = append(current.Local, aiDailyLocal{ID: pick.Song.ID, Reason: pick.Reason})
			}
			current.External = generated.ExternalRecommendations
		}
		return putAIDaily(ctx, tx.Property(), user.ID, current)
	}, "save daily AI result")
	return errors.Join(generationErr, persistErr)
}

func aiDailyRank(date, userID, identity string) string {
	digest := sha256.Sum256([]byte(date + "\x00" + userID + "\x00" + identity))
	return hex.EncodeToString(digest[:])
}

func selectAIDaily(result *AIRecommendations, date, userID string) {
	sort.Slice(result.Recommendations, func(i, j int) bool {
		return aiDailyRank(date, userID, result.Recommendations[i].Song.ID) < aiDailyRank(date, userID, result.Recommendations[j].Song.ID)
	})
	sort.Slice(result.ExternalRecommendations, func(i, j int) bool {
		return aiDailyRank(date, userID, aiSongKey(result.ExternalRecommendations[i].Title, result.ExternalRecommendations[i].Artist)) < aiDailyRank(date, userID, aiSongKey(result.ExternalRecommendations[j].Title, result.ExternalRecommendations[j].Artist))
	})
	localCount, externalCount := min(3, len(result.Recommendations)), min(3, len(result.ExternalRecommendations))
	remaining := aiDailyCount - localCount - externalCount
	extraLocal := min(remaining, len(result.Recommendations)-localCount)
	localCount += extraLocal
	remaining -= extraLocal
	externalCount += min(remaining, len(result.ExternalRecommendations)-externalCount)
	result.Recommendations = result.Recommendations[:localCount]
	result.ExternalRecommendations = result.ExternalRecommendations[:externalCount]
}
