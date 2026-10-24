package nativeapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/core"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	"github.com/navidrome/navidrome/tests"
)

func TestSongManagementConfirmationAndAdminGuard(t *testing.T) {
	ds := &tests.MockDataStore{}
	service := core.NewSongTrash(ds, t.TempDir())
	router := chi.NewRouter()
	router.With(adminOnlyMiddleware).Post("/song/batch", manageSongs(service))
	admin := request.WithUser(t.Context(), model.User{ID: "admin", IsAdmin: true})
	for _, body := range []string{`{}`, `{"confirm":false,"ids":["song"],"mode":"permanent"}`, `{"confirm":true,"ids":["song"],"mode":"permanent","extra":1}`, `{"confirm":true,"ids":["song"],"mode":"permanent"} {}`, `{"confirm":true,"ids":[],"mode":"permanent"}`, `{"confirm":true,"ids":["song","song"],"mode":"permanent"}`} {
		req := httptest.NewRequest(http.MethodPost, "/song/batch", strings.NewReader(body)).WithContext(admin)
		out := httptest.NewRecorder()
		router.ServeHTTP(out, req)
		if out.Code != http.StatusBadRequest {
			t.Fatalf("invalid body status %d: %s", out.Code, out.Body.String())
		}
	}
	for _, ctx := range []context.Context{t.Context(), request.WithUser(t.Context(), model.User{ID: "regular"})} {
		req := httptest.NewRequest(http.MethodPost, "/song/batch", strings.NewReader(`{"confirm":true,"ids":["song"],"mode":"permanent"}`)).WithContext(ctx)
		out := httptest.NewRecorder()
		router.ServeHTTP(out, req)
		if out.Code != http.StatusForbidden {
			t.Fatalf("admin guard bypassed: %d", out.Code)
		}
	}
}
