package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	"github.com/navidrome/navidrome/tests"
)

func dailyAIFixture(t *testing.T) (*AIMusic, *tests.MockDataStore, context.Context, *atomic.Int32, *atomic.Bool, time.Time) {
	t.Helper()
	svc, ds, admin := aiFixture(t)
	user := model.User{ID: "user", UserName: "listener", Libraries: model.Libraries{{ID: 1}}}
	users := tests.CreateMockUserRepo()
	users.Data[user.UserName] = &user
	ds.MockedUser = users
	var calls atomic.Int32
	var fail atomic.Bool
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if fail.Load() {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		external := make([]AIExternalRecommendation, 0, 8)
		for i := range 8 {
			external = append(external, AIExternalRecommendation{Title: fmt.Sprintf("External daily %d", i), Artist: "Daily artist", Reason: "Music to discover"})
		}
		content, _ := json.Marshal(map[string]any{
			"analysis": "Daily taste analysis", "recommendations": []map[string]string{{"id": "c1", "reason": "Local daily selection"}}, "externalRecommendations": external,
		})
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": string(content)}}}})
	}))
	t.Cleanup(provider.Close)
	if _, err := svc.UpdateSettings(admin, AIMusicSettingsUpdate{Enabled: true, Endpoint: provider.URL, Model: "daily-fixture", APIKey: t.Name()}); err != nil {
		t.Fatal(err)
	}
	ctx := request.WithUser(t.Context(), user)
	now := time.Date(2026, 10, 25, 20, 0, 0, 0, time.UTC) // 04:00 in Shanghai, after the daily boundary.
	return svc, ds, ctx, &calls, &fail, now
}

func TestAIMusicDailyCalendarUsesShanghaiThreeAM(t *testing.T) {
	before := time.Date(2026, 10, 25, 18, 59, 59, 0, time.UTC)
	date, next := aiDailyCalendar(before)
	if date != "2026-10-25" || !next.Equal(time.Date(2026, 10, 25, 19, 0, 0, 0, time.UTC)) {
		t.Fatalf("wrong pre-boundary schedule: %s %v", date, next)
	}
	date, next = aiDailyCalendar(before.Add(time.Second))
	if date != "2026-10-26" || !next.Equal(time.Date(2026, 10, 26, 19, 0, 0, 0, time.UTC)) {
		t.Fatalf("wrong new daily schedule: %s %v", date, next)
	}
}

func TestAIMusicDailyReadsNeverInvokeProviderAndGenerationPersistsAcrossRestart(t *testing.T) {
	svc, ds, ctx, calls, _, now := dailyAIFixture(t)
	if _, err := svc.Daily(t.Context(), now); !errors.Is(err, ErrAIUnauthorized) {
		t.Fatal("unauthenticated daily read")
	}
	initial, err := svc.Daily(ctx, now)
	if err != nil || initial.State != "pending" || calls.Load() != 0 || !initial.Configured {
		t.Fatalf("read started generation: %+v %v", initial, err)
	}
	if err := svc.GenerateDaily(t.Context(), now); err != nil {
		t.Fatal(err)
	}
	first, err := svc.Daily(ctx, now)
	if err != nil || first.State != "ready" || first.Stale || first.GeneratedAt == nil || first.SourcePlaylistName != "Evening jazz" || len(first.Recommendations)+len(first.ExternalRecommendations) != aiDailyCount || calls.Load() != 1 {
		t.Fatalf("wrong generated daily result: %+v %v", first, err)
	}
	for range 3 {
		if err := svc.GenerateDaily(t.Context(), now.Add(time.Hour)); err != nil {
			t.Fatal(err)
		}
		again, err := svc.Daily(ctx, now.Add(time.Hour))
		if err != nil || !reflect.DeepEqual(first, again) || calls.Load() != 1 {
			t.Fatal("same day changed its selection or called the provider again")
		}
	}
	restarted := NewAIMusic(ds, svc.dataFolder)
	if err := restarted.GenerateDaily(t.Context(), now.Add(2*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err := restarted.Daily(ctx, now); err != nil || calls.Load() != 1 {
		t.Fatal("restart lost persisted daily claim")
	}
	stored, err := ds.Property().Get(ctx, aiDailyProperty("user"))
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{t.Name(), "http://", "https://", "secret/music", "streamUrl", "encryptedKey", "apiKey"} {
		if strings.Contains(stored, forbidden) {
			t.Fatalf("daily cache retained a credential, endpoint or file record: %s", forbidden)
		}
	}
}

func TestAIMusicDailyFailedDayKeepsOldResultsAndCorrectedSettingsCanRecover(t *testing.T) {
	svc, ds, ctx, calls, fail, now := dailyAIFixture(t)
	if err := svc.GenerateDaily(t.Context(), now); err != nil {
		t.Fatal(err)
	}
	before, _ := svc.Daily(ctx, now)
	fail.Store(true)
	if err := svc.GenerateDaily(t.Context(), now.AddDate(0, 0, 1)); !errors.Is(err, ErrAIUnavailable) {
		t.Fatalf("provider failure was not reported: %v", err)
	}
	stale, err := svc.Daily(ctx, now.AddDate(0, 0, 1))
	if err != nil || stale.State != "ready" || !stale.Stale || stale.Date != before.Date || !reflect.DeepEqual(stale.Recommendations, before.Recommendations) || !reflect.DeepEqual(stale.ExternalRecommendations, before.ExternalRecommendations) {
		t.Fatalf("failed refresh destroyed successful cache: %+v %v", stale, err)
	}
	restarted := NewAIMusic(ds, svc.dataFolder)
	if err := restarted.GenerateDaily(t.Context(), now.AddDate(0, 0, 1).Add(time.Minute)); err != nil || calls.Load() != 2 {
		t.Fatal("failed daily claim was retried after restart")
	}
	settings, _ := svc.Settings(request.WithUser(ctx, model.User{ID: "admin", IsAdmin: true}))
	if _, err := svc.UpdateSettings(request.WithUser(ctx, model.User{ID: "admin", IsAdmin: true}), AIMusicSettingsUpdate{
		Enabled: true, Endpoint: settings.Endpoint, Model: "corrected-model",
	}); err != nil {
		t.Fatal(err)
	}
	fail.Store(false)
	if err := restarted.GenerateDaily(t.Context(), now.AddDate(0, 0, 1).Add(2*time.Minute)); err != nil || calls.Load() != 3 {
		t.Fatalf("corrected settings did not receive a fresh claim: %v", err)
	}
	fresh, err := restarted.Daily(ctx, now.AddDate(0, 0, 1).Add(2*time.Minute))
	if err != nil || fresh.Stale || fresh.Date == before.Date {
		t.Fatal("recovery did not publish the new date")
	}
}

func TestAIMusicDailyDisabledAndUnavailableSourcesDoNotConsumeAnAttempt(t *testing.T) {
	svc, ds, ctx, calls, _, now := dailyAIFixture(t)
	playlists := ds.MockedPlaylist.(*tests.MockPlaylistRepo)
	original := playlists.All
	playlists.SetData(nil)
	if err := svc.GenerateDaily(t.Context(), now); err != nil || calls.Load() != 0 {
		t.Fatal("empty source called the provider")
	}
	if _, err := ds.Property().Get(ctx, aiDailyProperty("user")); !errors.Is(err, model.ErrNotFound) {
		t.Fatal("empty source consumed a daily attempt")
	}
	playlists.SetData(original)
	if err := svc.GenerateDaily(t.Context(), now); err != nil || calls.Load() != 1 {
		t.Fatal("new source did not get its first background generation")
	}
	admin := request.WithUser(ctx, model.User{ID: "admin", IsAdmin: true})
	settings, _ := svc.Settings(admin)
	if _, err := svc.UpdateSettings(admin, AIMusicSettingsUpdate{Endpoint: settings.Endpoint, Model: settings.Model}); err != nil {
		t.Fatal(err)
	}
	result, err := svc.Daily(ctx, now)
	if err != nil || result.State != "disabled" || result.Configured || len(result.Recommendations)+len(result.ExternalRecommendations) != 0 || result.Analysis != "" {
		t.Fatal("disabled AI exposed a cached private result")
	}
	if err := svc.GenerateDaily(t.Context(), now.AddDate(0, 0, 1)); err != nil || calls.Load() != 1 {
		t.Fatal("disabled AI called provider")
	}
}

func TestAIMusicDailyCacheRechecksSourceAndLocalLibraryPermissions(t *testing.T) {
	svc, ds, ctx, _, _, now := dailyAIFixture(t)
	if err := svc.GenerateDaily(t.Context(), now); err != nil {
		t.Fatal(err)
	}
	media := ds.MockedMediaFile.(*tests.MockMediaFileRepo)
	media.Data["candidate"].Trashed = true
	withoutSong, err := svc.Daily(ctx, now)
	if err != nil || len(withoutSong.Recommendations) != 0 || len(withoutSong.ExternalRecommendations) == 0 {
		t.Fatal("trashed local track stayed in daily playback")
	}
	revoked := request.WithUser(ctx, model.User{ID: "user", UserName: "listener", Libraries: model.Libraries{}})
	withoutLibrary, err := svc.Daily(revoked, now)
	if err != nil || withoutLibrary.State != "pending" || withoutLibrary.Analysis != "" || len(withoutLibrary.ExternalRecommendations) != 0 || withoutLibrary.SourcePlaylistName != "" {
		t.Fatal("old cache survived a library authorization change")
	}
	playlist := ds.MockedPlaylist.(*tests.MockPlaylistRepo).Data["playlist"]
	playlist.OwnerID = "someone-else"
	playlist.Public = false
	hidden, err := svc.Daily(ctx, now)
	if err != nil || hidden.Analysis != "" || len(hidden.ExternalRecommendations) != 0 || hidden.SourcePlaylistName != "" {
		t.Fatal("private source playlist leaked through daily cache")
	}
}

type dailyPutFailure struct {
	model.PropertyRepository
	cacheWrites int
	failAt      int
}

func (p *dailyPutFailure) Put(ctx context.Context, key, value string) error {
	if strings.HasPrefix(key, aiDailyPropertyPrefix) {
		p.cacheWrites++
		if p.cacheWrites == p.failAt {
			return errors.New("synthetic persistence failure")
		}
	}
	return p.PropertyRepository.Put(ctx, key, value)
}

func TestAIMusicDailyPersistenceFailuresDoNotInventSuccessOrDuplicateCalls(t *testing.T) {
	for _, failAt := range []int{1, 2} {
		t.Run(fmt.Sprint(failAt), func(t *testing.T) {
			svc, ds, ctx, calls, _, now := dailyAIFixture(t)
			properties := &dailyPutFailure{PropertyRepository: ds.Property(), failAt: failAt}
			ds.MockedProperty = properties
			if err := svc.GenerateDaily(t.Context(), now); err == nil {
				t.Fatal("persistence failure reported success")
			}
			result, err := svc.Daily(ctx, now.Add(3*time.Minute))
			if err != nil || result.State == "ready" || len(result.Recommendations)+len(result.ExternalRecommendations) != 0 {
				t.Fatal("unsaved result was returned as successful")
			}
			if failAt == 1 && calls.Load() != 0 {
				t.Fatal("provider called before durable claim")
			}
			if failAt == 2 {
				if err := NewAIMusic(ds, svc.dataFolder).GenerateDaily(t.Context(), now.Add(4*time.Minute)); err != nil || calls.Load() != 1 {
					t.Fatal("result save failure caused a duplicate paid request")
				}
			}
		})
	}
}

func TestAIMusicDailySelectionIsStableBoundedAndChangesByDay(t *testing.T) {
	makeResult := func() *AIRecommendations {
		result := &AIRecommendations{}
		for i := range 12 {
			result.Recommendations = append(result.Recommendations, AIRecommendation{Song: model.MediaFile{ID: fmt.Sprint(i)}})
			result.ExternalRecommendations = append(result.ExternalRecommendations, AIExternalRecommendation{Title: fmt.Sprint(i), Artist: "Artist"})
		}
		return result
	}
	first, again, tomorrow := makeResult(), makeResult(), makeResult()
	selectAIDaily(first, "2026-10-25", "user")
	selectAIDaily(again, "2026-10-25", "user")
	selectAIDaily(tomorrow, "2026-10-26", "user")
	if !reflect.DeepEqual(first, again) || reflect.DeepEqual(first, tomorrow) || len(first.Recommendations) != 3 || len(first.ExternalRecommendations) != 3 {
		t.Fatal("daily shuffle is unstable, unbounded or never changes")
	}
}
