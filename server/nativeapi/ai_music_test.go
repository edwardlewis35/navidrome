package nativeapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	"github.com/navidrome/navidrome/tests"
)

func aiTestRouter() http.Handler {
	ds := &tests.MockDataStore{}
	r := chi.NewRouter()
	(&Router{ds: ds}).addAIMusicRoutes(r)
	return r
}

func aiTestRequest(router http.Handler, method, path, body string, user model.User) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if user.ID != "" {
		req = req.WithContext(request.WithUser(req.Context(), user))
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestAIMusicNativeAPIAdminGateAndMaskedSettings(t *testing.T) {
	router := aiTestRouter()
	for _, method := range []string{http.MethodGet, http.MethodPut} {
		w := aiTestRequest(router, method, "/ai/settings", `{}`, model.User{ID: "regular"})
		if w.Code != http.StatusForbidden {
			t.Fatalf("settings %s accepted regular user: %d", method, w.Code)
		}
	}
	w := aiTestRequest(router, http.MethodGet, "/ai/status", "", model.User{})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated status %d", w.Code)
	}
	admin := model.User{ID: "admin", IsAdmin: true}
	w = aiTestRequest(router, http.MethodPut, "/ai/settings", `{"enabled":true,"endpoint":"https://ai.example/v1","model":"example"}`, admin)
	if w.Code != http.StatusOK {
		t.Fatalf("settings failed %d %s", w.Code, w.Body.String())
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("settings response can be cached")
	}
	var settings map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &settings); err != nil {
		t.Fatal(err)
	}
	if _, exists := settings["apiKey"]; exists {
		t.Fatal("settings exposes API key")
	}
	if _, exists := settings["encryptedKey"]; exists {
		t.Fatal("settings exposes encrypted API key")
	}
	w = aiTestRequest(router, http.MethodGet, "/ai/status", "", model.User{ID: "regular"})
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"configured":true`) {
		t.Fatal("readiness not available to user")
	}
	for _, secretField := range []string{"endpoint", "model", "keyConfigured"} {
		if strings.Contains(w.Body.String(), secretField) {
			t.Fatal("readiness exposes provider settings")
		}
	}
}

func TestAIMusicNativeAPIRejectsMalformedInputBeforeMutation(t *testing.T) {
	admin := model.User{ID: "admin", IsAdmin: true}
	for _, body := range []string{``, `null`, `{"enabled":true}`, `{"unknown":"field"}`, `{} {}`, strings.Repeat("x", 17<<10)} {
		t.Run(body[:min(len(body), 30)], func(t *testing.T) {
			w := aiTestRequest(aiTestRouter(), http.MethodPut, "/ai/settings", body, admin)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("bad input accepted: %d %s", w.Code, w.Body.String())
			}
		})
	}
	for _, body := range []string{``, `{}`, `{"playlistId":"x","apiKey":"should-not-be-accepted"}`, `{"playlistId":"x"} {}`} {
		w := aiTestRequest(aiTestRouter(), http.MethodPost, "/ai/recommendations", body, admin)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("recommendation input accepted: %d", w.Code)
		}
	}
}
