package nativeapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/deluan/rest"
	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/core/onlinecover"
	"github.com/navidrome/navidrome/core/playlists"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	"github.com/navidrome/navidrome/tests"
)

type mockOnlineCatalogue struct {
	searches, downloads int
	query, release      string
	err                 error
}

func (m *mockOnlineCatalogue) Search(_ context.Context, query, release string) ([]onlinecover.Candidate, error) {
	m.searches++
	m.query = query
	m.release = release
	return []onlinecover.Candidate{}, m.err
}
func (m *mockOnlineCatalogue) Download(_ context.Context, id string) ([]byte, error) {
	m.downloads++
	return []byte("fixture"), m.err
}

func onlineCoverFixture(t *testing.T) (*Router, model.User) {
	t.Helper()
	t.Cleanup(conf.SnapshotConfig())
	conf.Server.EnableArtworkUpload = true
	media := tests.CreateMockMediaFileRepo()
	media.SetData(model.MediaFiles{{ID: "song", LibraryID: 1, Title: "Song", Album: "Local album", Artist: "Artist", Path: "private/audio.mp3"}, {ID: "hidden", LibraryID: 2, Title: "Hidden"}, {ID: "missing", LibraryID: 1, Missing: true}, {ID: "trashed", LibraryID: 1, Trashed: true}})
	albums := tests.CreateMockAlbumRepo()
	albums.SetData(model.Albums{{ID: "album", Name: "Album", LibraryID: 1}, {ID: "hidden-album", Name: "Hidden album", LibraryID: 2}, {ID: "missing-album", Missing: true, LibraryID: 1}})
	pls := tests.CreateMockPlaylistRepo()
	pls.SetData(model.Playlists{{ID: "own", Name: "Evening jazz", OwnerID: "user"}, {ID: "public", Name: "Shared jazz", OwnerID: "other", Public: true}, {ID: "private", Name: "Other private playlist", OwnerID: "other"}})
	ds := &tests.MockDataStore{MockedMediaFile: media, MockedAlbum: albums, MockedPlaylist: pls}
	return &Router{ds: ds, playlists: playlists.NewPlaylists(ds, nil)}, model.User{ID: "user", Libraries: model.Libraries{{ID: 1}}}
}

func TestOnlineCoverRequiresAccessibleMusicAndOwnershipForWrites(t *testing.T) {
	api, user := onlineCoverFixture(t)
	ctx := request.WithUser(t.Context(), user)
	for _, tc := range []struct {
		kind, id string
		write    bool
		want     error
	}{
		{"song", "song", false, nil}, {"album", "album", false, nil}, {"playlist", "own", false, nil}, {"playlist", "public", false, nil},
		{"song", "hidden", false, model.ErrNotFound}, {"album", "hidden-album", false, model.ErrNotFound}, {"song", "missing", false, model.ErrNotFound}, {"song", "trashed", false, model.ErrNotFound}, {"album", "missing-album", false, model.ErrNotFound}, {"playlist", "private", false, model.ErrNotFound},
		{"song", "song", true, rest.ErrPermissionDenied}, {"album", "album", true, rest.ErrPermissionDenied}, {"playlist", "own", true, nil}, {"playlist", "public", true, rest.ErrPermissionDenied},
	} {
		_, err := api.onlineCoverEntity(ctx, tc.kind, tc.id, tc.write)
		if !errors.Is(err, tc.want) {
			t.Errorf("%s/%s write=%v: %v want %v", tc.kind, tc.id, tc.write, err, tc.want)
		}
	}
	conf.Server.EnableArtworkUpload = false
	if _, err := api.onlineCoverEntity(ctx, "playlist", "own", true); !errors.Is(err, rest.ErrPermissionDenied) {
		t.Fatal("owner upload setting bypassed")
	}
	admin := request.WithUser(t.Context(), model.User{ID: "admin", IsAdmin: true})
	for _, kind := range []string{"song", "album"} {
		if _, err := api.onlineCoverEntity(admin, kind, kind, true); err != nil {
			t.Fatalf("admin write denied: %v", err)
		}
	}
	if _, err := api.onlineCoverEntity(t.Context(), "song", "song", false); !errors.Is(err, rest.ErrPermissionDenied) {
		t.Fatal("unauthenticated catalogue access")
	}
}

func TestOnlineCoverChecksAuthorizationBeforeProviderRequest(t *testing.T) {
	api, user := onlineCoverFixture(t)
	catalogue := &mockOnlineCatalogue{}
	router := chi.NewRouter()
	api.addOnlineCoverRoutesWithCatalogue(router, catalogue)
	for _, tc := range []struct {
		path, body string
		want       int
	}{
		{"/online-cover/search", `{"kind":"song","id":"hidden"}`, http.StatusNotFound},
		{"/online-cover/search", `{"kind":"playlist","id":"private"}`, http.StatusNotFound},
		{"/online-cover/apply", `{"kind":"song","id":"song","releaseId":"ddafc115-a696-4d31-9a27-081231720ddd"}`, http.StatusForbidden},
		{"/online-cover/apply", `{"kind":"playlist","id":"public","releaseId":"ddafc115-a696-4d31-9a27-081231720ddd"}`, http.StatusForbidden},
	} {
		req := httptest.NewRequest(http.MethodPost, tc.path, strings.NewReader(tc.body))
		req = req.WithContext(request.WithUser(req.Context(), user))
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		if response.Code != tc.want {
			t.Errorf("authorization %s: %d %s", tc.body, response.Code, response.Body.String())
		}
	}
	if catalogue.searches != 0 || catalogue.downloads != 0 {
		t.Fatal("unauthorized request reached catalogue")
	}
}

func TestOnlineCoverSearchUsesNamesAndMapsBusyAndUnavailable(t *testing.T) {
	api, user := onlineCoverFixture(t)
	catalogue := &mockOnlineCatalogue{}
	router := chi.NewRouter()
	api.addOnlineCoverRoutesWithCatalogue(router, catalogue)
	call := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/online-cover/search", strings.NewReader(body))
		req = req.WithContext(request.WithUser(req.Context(), user))
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		return response
	}
	response := call(`{"kind":"song","id":"song"}`)
	if response.Code != http.StatusOK || !strings.Contains(catalogue.query, `Local album`) || !strings.Contains(catalogue.query, `Artist`) || strings.Contains(catalogue.query, `private/audio`) {
		t.Fatalf("wrong provider metadata: %d %s", response.Code, catalogue.query)
	}
	catalogue.err = onlinecover.ErrBusy
	if response = call(`{"kind":"playlist","id":"own"}`); response.Code != http.StatusTooManyRequests {
		t.Fatal("busy was not distinguished")
	}
	catalogue.err = onlinecover.ErrUnavailable
	if response = call(`{"kind":"playlist","id":"own"}`); response.Code != http.StatusBadGateway {
		t.Fatal("catalogue failure was not distinguished")
	}
	for _, body := range []string{``, `null`, `{}`, `{"kind":"song","id":"song","url":"https://untrusted.example"}`, `{"kind":"song","id":"song"} {}`, `{"kind":"song","id":"../outside"}`} {
		if response = call(body); response.Code != http.StatusBadRequest {
			t.Errorf("invalid request accepted: %q %d", body, response.Code)
		}
	}
}
