package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	"github.com/navidrome/navidrome/tests"
)

func aiFixture(t *testing.T) (*AIMusic, *tests.MockDataStore, context.Context) {
	t.Helper()
	media := tests.CreateMockMediaFileRepo()
	media.SetData(model.MediaFiles{
		{ID: "source", LibraryID: 1, Title: "Source song", Artist: "Source artist", Album: "Source album", Genre: "Jazz", Path: "secret/music/location.mp3"},
		{ID: "candidate", LibraryID: 1, Title: "Local song", Artist: "Local artist", Album: "Local album"},
		{ID: "hidden", LibraryID: 2, Title: "Private library song"},
		{ID: "missing", LibraryID: 1, Title: "Missing song", Missing: true},
	})
	pls := tests.CreateMockPlaylistRepo()
	pls.SetData(model.Playlists{{ID: "playlist", Name: "Evening jazz", OwnerID: "user"}})
	pls.TracksRepo = &tests.MockPlaylistTrackRepo{Data: model.PlaylistTracks{
		{MediaFile: *media.Data["source"], MediaFileID: "source"},
		{MediaFile: *media.Data["hidden"], MediaFileID: "hidden"},
	}}
	ds := &tests.MockDataStore{MockedMediaFile: media, MockedPlaylist: pls}
	ctx := request.WithUser(t.Context(), model.User{ID: "admin", IsAdmin: true})
	return NewAIMusic(ds, t.TempDir()), ds, ctx
}

func TestAIMusicSettingsRequireAdminAndNeverExposeKey(t *testing.T) {
	svc, ds, ctx := aiFixture(t)
	for _, unauthorized := range []context.Context{t.Context(), request.WithUser(t.Context(), model.User{ID: "regular"})} {
		if _, err := svc.Settings(unauthorized); err == nil {
			t.Fatal("settings accepted unauthorized user")
		}
		if _, err := svc.UpdateSettings(unauthorized, AIMusicSettingsUpdate{}); err == nil {
			t.Fatal("settings update accepted unauthorized user")
		}
	}
	updated, err := svc.UpdateSettings(ctx, AIMusicSettingsUpdate{Enabled: true, Endpoint: "https://ai.example/v1", Model: "example-model", APIKey: "fixture-secret-keep-private"})
	if err != nil {
		t.Fatal(err)
	}
	if !updated.KeyConfigured || !updated.Enabled {
		t.Fatal("settings not configured")
	}
	encoded, _ := json.Marshal(updated)
	stored, err := ds.Property().Get(ctx, aiSettingsProperty)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "fixture-secret") || strings.Contains(stored, "fixture-secret") {
		t.Fatal("plaintext key exposed")
	}
	info, err := os.Stat(filepath.Join(svc.dataFolder, aiCredentialsKeyFile))
	if err != nil || info.Size() != 32 {
		t.Fatal("missing independent credential key")
	}
	loaded, err := svc.loadSettings(ctx)
	if err != nil {
		t.Fatal(err)
	}
	secret, err := svc.decryptKey(ctx, loaded.EncryptedKey)
	if err != nil || secret != "fixture-secret-keep-private" {
		t.Fatal("stored credential did not round trip")
	}
	// Blank means keep; changing a provider must explicitly replace or clear its credential.
	if _, err := svc.UpdateSettings(ctx, AIMusicSettingsUpdate{Enabled: true, Endpoint: "https://other.example/v1", Model: "other"}); !errors.Is(err, ErrAIInvalidSettings) {
		t.Fatalf("unsafe credential reuse: %v", err)
	}
	kept, err := svc.UpdateSettings(ctx, AIMusicSettingsUpdate{Enabled: true, Endpoint: updated.Endpoint, Model: "new-model"})
	if err != nil || !kept.KeyConfigured {
		t.Fatalf("failed to keep saved key: %v", err)
	}
	cleared, err := svc.UpdateSettings(ctx, AIMusicSettingsUpdate{Enabled: true, Endpoint: "http://localhost:11434/v1", Model: "local", ClearKey: true})
	if err != nil || cleared.KeyConfigured {
		t.Fatalf("clear key: %v", err)
	}
}

func TestAIMusicRejectsUnsafeEndpointAndCredentials(t *testing.T) {
	for _, endpoint := range []string{"https://user:password@ai.example/v1", "file:///etc/passwd", "ftp://ai.example", "https://ai.example/v1?api_key=secret", "https://ai.example/v1#fragment", "http://public.example/v1", "//ai.example", "https://"} {
		if _, err := validateAIEndpoint(endpoint); err == nil {
			t.Errorf("accepted endpoint %q", endpoint)
		}
	}
	for _, endpoint := range []string{"https://ai.example/v1", "http://localhost:11434/v1", "http://192.168.8.10:8000/v1", "http://[::1]:8080/v1", "http://ollama:11434/v1"} {
		if _, err := validateAIEndpoint(endpoint); err != nil {
			t.Errorf("rejected endpoint %q: %v", endpoint, err)
		}
	}
	svc, _, ctx := aiFixture(t)
	if _, err := svc.UpdateSettings(ctx, AIMusicSettingsUpdate{Endpoint: "https://ai.example/v1", Model: "model", APIKey: "key\r\nheader: injected"}); !errors.Is(err, ErrAIInvalidSettings) { // #nosec G101 -- Deliberately invalid synthetic CRLF credential for validation.
		t.Fatal("accepted newline in credential")
	}
	if _, err := svc.UpdateSettings(ctx, AIMusicSettingsUpdate{Enabled: true}); !errors.Is(err, ErrAIInvalidSettings) {
		t.Fatal("accepted incomplete enabled settings")
	}
}

func TestAIMusicRejectsSymlinkCredentialFile(t *testing.T) {
	svc, _, ctx := aiFixture(t)
	outside := filepath.Join(t.TempDir(), "outside")
	if err := os.WriteFile(outside, make([]byte, 32), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(svc.dataFolder, aiCredentialsKeyFile)); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if _, err := svc.UpdateSettings(ctx, AIMusicSettingsUpdate{Endpoint: "https://ai.example/v1", Model: "model", APIKey: "fixture"}); err == nil {
		t.Fatal("accepted symlink key")
	}
}

func TestAIMusicOnlySendsAuthorizedMetadataAndBindsLocalIDs(t *testing.T) {
	svc, _, admin := aiFixture(t)
	var calls int
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/chat/completions" || r.Method != http.MethodPost || r.Header.Get("Authorization") != "Bearer fixture-secret" {
			t.Error("wrong provider request")
		}
		body, _ := io.ReadAll(r.Body)
		for _, forbidden := range []string{"secret/music/location", "Private library song", "Missing song", "libraryPath", "userName", "fixture-secret"} {
			if strings.Contains(string(body), forbidden) {
				t.Errorf("sensitive or inaccessible data sent: %s", forbidden)
			}
		}
		if !strings.Contains(string(body), "Source song") || !strings.Contains(string(body), "Local song") {
			t.Error("music metadata not sent")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": `{"analysis":"Jazz in the evening","recommendations":[{"id":"invented","reason":"ignore"},{"id":"c1","reason":"Warm harmonies"},{"id":"c1","reason":"duplicate"}]}`}}}})
	}))
	defer provider.Close()
	if _, err := svc.UpdateSettings(admin, AIMusicSettingsUpdate{Enabled: true, Endpoint: provider.URL + "/v1", Model: "fixture-model", APIKey: "fixture-secret"}); err != nil {
		t.Fatal(err)
	}
	user := request.WithUser(t.Context(), model.User{ID: "user", Libraries: model.Libraries{{ID: 1}}})
	result, err := svc.Recommend(user, "playlist")
	if err != nil {
		t.Fatal(err)
	}
	if calls != 1 || result.SourceCount != 1 || result.CandidateCount != 1 || len(result.Recommendations) != 1 || result.Recommendations[0].Song.ID != "candidate" || result.Recommendations[0].Reason != "Warm harmonies" {
		t.Fatalf("wrong recommendation: %+v", result)
	}
	if _, err := svc.Recommend(user, "playlist"); !errors.Is(err, ErrAIBusy) || calls != 1 {
		t.Fatalf("rate limit missing: %v", err)
	}
}

func TestAIMusicRejectsProviderRedirectAndNeverLeaksKey(t *testing.T) {
	svc, _, ctx := aiFixture(t)
	leaks := 0
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { leaks++; w.WriteHeader(http.StatusOK) }))
	defer target.Close()
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusTemporaryRedirect)
	}))
	defer provider.Close()
	if _, err := svc.UpdateSettings(ctx, AIMusicSettingsUpdate{Enabled: true, Endpoint: provider.URL, Model: "fixture", APIKey: "private-key"}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Recommend(ctx, "playlist"); !errors.Is(err, ErrAIUnavailable) {
		t.Fatalf("redirect accepted: %v", err)
	}
	if leaks != 0 {
		t.Fatal("provider credentials forwarded to redirect")
	}
}

func TestAIMusicValidatesModelOutputAndBoundsResponse(t *testing.T) {
	for _, content := range []string{`not JSON`, `{"analysis":"x","recommendations":[{"id":"invented","reason":"x"}]}`, `{"analysis":"x","recommendations":[],"commands":"unexpected"}`, `{"analysis":"x","recommendations":[]} {"extra":true}`} {
		t.Run(content[:min(len(content), 25)], func(t *testing.T) {
			svc, _, ctx := aiFixture(t)
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": content}}}})
			}))
			defer provider.Close()
			if _, err := svc.UpdateSettings(ctx, AIMusicSettingsUpdate{Enabled: true, Endpoint: provider.URL, Model: "fixture"}); err != nil {
				t.Fatal(err)
			}
			if _, err := svc.Recommend(ctx, "playlist"); !errors.Is(err, ErrAIInvalidResponse) {
				t.Fatalf("model output accepted: %v", err)
			}
		})
	}
	svc, _, ctx := aiFixture(t)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, strings.Repeat("x", aiResponseLimit+1))
	}))
	defer provider.Close()
	if _, err := svc.UpdateSettings(ctx, AIMusicSettingsUpdate{Enabled: true, Endpoint: provider.URL, Model: "fixture"}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Recommend(ctx, "playlist"); !errors.Is(err, ErrAIInvalidResponse) {
		t.Fatal("oversized provider response accepted")
	}
}

func TestAIMusicUnavailableAndAuthorizationDoNotCallProvider(t *testing.T) {
	svc, _, admin := aiFixture(t)
	if _, err := svc.Recommend(t.Context(), "playlist"); !errors.Is(err, ErrAIUnauthorized) {
		t.Fatal("unauthenticated recommendation accepted")
	}
	if _, err := svc.Recommend(admin, "nonexistent"); !errors.Is(err, model.ErrNotFound) {
		t.Fatal("nonexistent playlist accepted")
	}
	if _, err := svc.Recommend(admin, "playlist"); !errors.Is(err, ErrAINotConfigured) {
		t.Fatal("unconfigured provider accepted")
	}
	if _, err := svc.Recommend(request.WithUser(t.Context(), model.User{ID: "different-user", Libraries: model.Libraries{{ID: 1}}}), "playlist"); !errors.Is(err, model.ErrNotFound) {
		t.Fatal("private playlist accepted for a different user")
	}
	status, err := svc.Status(admin)
	if err != nil || status.Configured {
		t.Fatal("unconfigured status incorrect")
	}
	// The semaphore is a separate limit from each user's cooldown.
	release, err := svc.acquire("first")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.acquire("second"); !errors.Is(err, ErrAIBusy) {
		t.Fatal("concurrency limit missing")
	}
	release()
	svc.lastRequest["first"] = time.Now().Add(-time.Minute)
	release, err = svc.acquire("first")
	if err != nil {
		t.Fatal(err)
	}
	release()
}

func TestAIMusicExternalRecommendationsAreBoundedAndSeparateFromPlayback(t *testing.T) {
	svc, ds, ctx := aiFixture(t)
	local, err := ds.MediaFile().Get(ctx, "candidate")
	if err != nil {
		t.Fatal(err)
	}
	response := &aiProviderResult{ExternalRecommendations: []AIExternalRecommendation{
		{Title: " source song ", Artist: "SOURCE ARTIST", Reason: "already in source"},
		{Title: "Local song", Artist: "Local artist", Reason: "already a local candidate"},
		{Title: "  Take Five  ", Artist: "The Dave Brubeck Quartet", Reason: "  Rhythmic   jazz affinity  "},
		{Title: "take five", Artist: "the dave brubeck quartet", Reason: "duplicate"},
		{Title: "", Artist: "Incomplete"},
		{Title: "Incomplete", Artist: "  "},
		{Title: "Song\x00injection", Artist: "Invalid"},
		{Title: strings.Repeat("界", 161), Artist: "Oversized"},
		{Title: "Oversized artist", Artist: strings.Repeat("a", 161)},
		{Title: "Control artist", Artist: "Artist\nnext"},
	}}
	for i := range 20 {
		response.ExternalRecommendations = append(response.ExternalRecommendations, AIExternalRecommendation{
			Title: fmt.Sprintf("External fixture %d", i), Artist: "Fixture artist", Reason: strings.Repeat("x", 600),
		})
	}
	result, err := svc.bindRecommendations(ctx, model.User{ID: "admin", IsAdmin: true},
		&AIRecommendations{Recommendations: []AIRecommendation{}, ExternalRecommendations: []AIExternalRecommendation{}},
		response, map[string]model.MediaFile{"c1": *local},
		[]aiTrack{{Title: "Source song", Artist: "Source artist"}})
	if err != nil || len(result.Recommendations) != 0 || len(result.ExternalRecommendations) != aiExternalResultLimit {
		t.Fatalf("external-only recommendations were not bounded separately: %+v %v", result, err)
	}
	if got := result.ExternalRecommendations[0]; got.Title != "Take Five" || got.Artist != "The Dave Brubeck Quartet" || got.Reason != "Rhythmic jazz affinity" {
		t.Fatalf("external names and reasons not preserved safely: %+v", got)
	}
	if len(result.ExternalRecommendations[1].Reason) != 500 {
		t.Fatal("external reason was not bounded")
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &fields); err != nil {
		t.Fatal(err)
	}
	if string(fields["recommendations"]) != "[]" || strings.Contains(string(fields["externalRecommendations"]), `"id"`) || strings.Contains(string(fields["externalRecommendations"]), `"streamUrl"`) {
		t.Fatal("external recommendations pretended to be playable local tracks")
	}
}

func TestAIMusicExternalRecommendationsWorkWithoutLocalCandidates(t *testing.T) {
	svc, ds, admin := aiFixture(t)
	ds.MockedMediaFile.(*tests.MockMediaFileRepo).SetData(model.MediaFiles{
		{ID: "source", LibraryID: 1, Title: "Source song", Artist: "Source artist"},
	})
	var calls int
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var payload struct {
			Messages []struct {
				Content string `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || len(payload.Messages) != 2 {
			t.Error("invalid provider request")
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		var input struct {
			Source     []aiTrack `json:"source"`
			Candidates []aiTrack `json:"candidates"`
		}
		if err := json.Unmarshal([]byte(payload.Messages[1].Content), &input); err != nil || len(input.Source) != 1 || len(input.Candidates) != 0 || !strings.Contains(payload.Messages[0].Content, "externalRecommendations") {
			t.Error("external-only prompt lost its authorized source or schema")
		}
		content := `{"analysis":"Jazz preferences","recommendations":[],"externalRecommendations":[{"title":"So What","artist":"Miles Davis","reason":"Modal jazz beyond the local library"}]}`
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": content}}}})
	}))
	defer provider.Close()
	if _, err := svc.UpdateSettings(admin, AIMusicSettingsUpdate{Enabled: true, Endpoint: provider.URL, Model: "fixture"}); err != nil {
		t.Fatal(err)
	}
	user := request.WithUser(t.Context(), model.User{ID: "user", Libraries: model.Libraries{{ID: 1}}})
	result, err := svc.Recommend(user, "playlist")
	if err != nil || calls != 1 || result.CandidateCount != 0 || len(result.Recommendations) != 0 || len(result.ExternalRecommendations) != 1 || result.ExternalRecommendations[0].Title != "So What" || result.ExternalRecommendations[0].Artist != "Miles Davis" {
		t.Fatalf("missing external recommendations without local candidates: %+v %v", result, err)
	}
}

type aiExternalLookupRepo struct {
	model.MediaFileRepository
	options []model.QueryOptions
	rows    model.MediaFiles
}

func (r *aiExternalLookupRepo) GetAll(_ context.Context, options ...model.QueryOptions) (model.MediaFiles, error) {
	r.options = append(r.options, options...)
	return r.rows, nil
}

func TestAIMusicExternalRecommendationsExcludeUnpooledAuthorizedLibraryMatches(t *testing.T) {
	for _, libraryID := range []int{1, 2} {
		t.Run(fmt.Sprintf("library-%d", libraryID), func(t *testing.T) {
			svc, ds, ctx := aiFixture(t)
			repo := &aiExternalLookupRepo{MediaFileRepository: ds.MediaFile(), rows: model.MediaFiles{
				{ID: "unpooled", Title: "Outside candidate pool", Artist: "Fixture artist", LibraryID: libraryID},
			}}
			ds.MockedMediaFile = repo
			user := model.User{ID: "user", Libraries: model.Libraries{{ID: 1}}}
			response := &aiProviderResult{ExternalRecommendations: []AIExternalRecommendation{
				{Title: "Outside candidate pool", Artist: "Fixture artist", Reason: "model suggestion"},
			}}
			result, err := svc.bindRecommendations(ctx, user,
				&AIRecommendations{Recommendations: []AIRecommendation{}, ExternalRecommendations: []AIExternalRecommendation{}},
				response, map[string]model.MediaFile{}, []aiTrack{})
			if libraryID == 1 {
				if !errors.Is(err, ErrAIInvalidResponse) {
					t.Fatal("existing local track outside sampled pool was shown as external")
				}
			} else if err != nil || len(result.ExternalRecommendations) != 1 {
				t.Fatal("inaccessible library match leaked by removing an external suggestion")
			}
			if len(repo.options) != 1 || repo.options[0].Max != 1 {
				t.Fatal("external match query must return at most one row")
			}
			sql, args, err := repo.options[0].Filters.ToSql()
			if err != nil || !strings.Contains(sql, "media_file.library_id IN (?)") || !strings.Contains(sql, "media_file.missing") || !strings.Contains(sql, "media_file.trashed") || len(args) != 5 || args[4] != 1 {
				t.Fatalf("external lookup escaped authorized active library: %s %#v %v", sql, args, err)
			}
		})
	}
}

func TestAIMusicExternalLookupWorkIsBounded(t *testing.T) {
	svc, ds, ctx := aiFixture(t)
	repo := &aiExternalLookupRepo{MediaFileRepository: ds.MediaFile(), rows: model.MediaFiles{
		{Title: "Already local", Artist: "Fixture artist", LibraryID: 1},
	}}
	ds.MockedMediaFile = repo
	response := &aiProviderResult{}
	for i := range aiExternalScanLimit + 20 {
		response.ExternalRecommendations = append(response.ExternalRecommendations,
			AIExternalRecommendation{Title: fmt.Sprintf("Suggestion %d", i), Artist: "Fixture artist"})
	}
	// Return each requested name as an existing local record so no results fill
	// the output cap before the separate input-work limit is reached.
	repo.rows = nil
	for _, pick := range response.ExternalRecommendations {
		repo.rows = append(repo.rows, model.MediaFile{Title: pick.Title, Artist: pick.Artist, LibraryID: 1})
	}
	_, err := svc.bindRecommendations(ctx, model.User{ID: "admin", IsAdmin: true},
		&AIRecommendations{Recommendations: []AIRecommendation{}, ExternalRecommendations: []AIExternalRecommendation{}},
		response, map[string]model.MediaFile{}, []aiTrack{})
	if !errors.Is(err, ErrAIInvalidResponse) || len(repo.options) != aiExternalScanLimit {
		t.Fatalf("unbounded external lookup work: %d queries, %v", len(repo.options), err)
	}
}

func TestAIMusicRejectsExternalPlaybackURLsAndUnusableNames(t *testing.T) {
	for _, content := range []string{
		`{"recommendations":[],"externalRecommendations":[{"title":"Song","artist":"Artist","reason":"test","streamUrl":"https://example.com/audio"}]}`,
		`{"recommendations":[],"externalRecommendations":[{"title":"","artist":"Artist","reason":"test"}]}`,
	} {
		t.Run(content[:30], func(t *testing.T) {
			svc, _, ctx := aiFixture(t)
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": content}}}})
			}))
			defer provider.Close()
			if _, err := svc.UpdateSettings(ctx, AIMusicSettingsUpdate{Enabled: true, Endpoint: provider.URL, Model: "fixture"}); err != nil {
				t.Fatal(err)
			}
			if _, err := svc.Recommend(ctx, "playlist"); !errors.Is(err, ErrAIInvalidResponse) {
				t.Fatalf("unsafe or empty external recommendation accepted: %v", err)
			}
		})
	}
}
