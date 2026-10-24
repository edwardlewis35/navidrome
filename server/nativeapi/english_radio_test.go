package nativeapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/core/englishradio"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/tests"
)

func englishRadioTestRouter(ds *tests.MockDataStore) http.Handler {
	r := chi.NewRouter()
	api := &Router{ds: ds}
	service := englishradio.New(ds.Property(), ds.User())
	api.addEnglishRadioStreamRoute(r, service)
	api.addEnglishRadioProtectedRoutes(r, service)
	return r
}

func TestEnglishRadioCatalogTicketsAndPermissions(t *testing.T) {
	t.Cleanup(conf.SnapshotConfig())
	conf.Server.BasePath = "/music"
	r := englishRadioTestRouter(&tests.MockDataStore{})
	listener := model.User{ID: "listener"}
	w := aiTestRequest(r, http.MethodGet, "/english-radio/catalog", "", model.User{})
	if w.Code != http.StatusUnauthorized {
		t.Fatal("anonymous catalogue access")
	}
	w = aiTestRequest(r, http.MethodGet, "/english-radio/catalog", "", listener)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "Heart London") || strings.Contains(w.Body.String(), "streamURL") {
		t.Fatalf("catalogue: %d %s", w.Code, w.Body.String())
	}
	w = aiTestRequest(r, http.MethodPost, "/english-radio/play/heart-london", "", listener)
	var playback struct {
		StreamURL string `json:"streamUrl"`
	}
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &playback) != nil || playback.StreamURL != "/music/api/english-radio/stream/heart-london" {
		t.Fatalf("playback: %d %s", w.Code, w.Body.String())
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Path != playback.StreamURL || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode || strings.Contains(w.Body.String(), cookies[0].Value) || strings.Contains(playback.StreamURL, "?") {
		t.Fatal("capability escaped its station cookie")
	}
	for _, method := range []string{http.MethodGet, http.MethodPut} {
		w = aiTestRequest(r, method, "/english-radio/settings", `{"proxy":""}`, listener)
		if w.Code != http.StatusForbidden {
			t.Fatal("listener accessed proxy settings")
		}
	}
	w = aiTestRequest(r, http.MethodPost, "/english-radio/play/not-in-catalog", "", listener)
	if w.Code != http.StatusNotFound {
		t.Fatal("arbitrary station ticket allowed")
	}
	w = aiTestRequest(r, http.MethodGet, "/english-radio/stream/heart-london", "", model.User{})
	if w.Code != http.StatusUnauthorized {
		t.Fatal("public relay without ticket")
	}
	req := httptest.NewRequest(http.MethodGet, "/english-radio/stream/heart-london", nil)
	req.AddCookie(&http.Cookie{Name: radioTicketCookie, Value: "not-a-valid-capability"})
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized || req.Header.Get("Cookie") != "" {
		t.Fatal("invalid capability accepted or left in request log headers")
	}
}

func TestEnglishRadioSettingsValidateAndPersist(t *testing.T) {
	ds := &tests.MockDataStore{}
	r := englishRadioTestRouter(ds)
	admin := model.User{ID: "admin", IsAdmin: true}
	w := aiTestRequest(r, http.MethodPut, "/english-radio/settings", `{"proxy":"https://proxy.example:443"}`, admin)
	if w.Code != http.StatusOK {
		t.Fatalf("save proxy: %d %s", w.Code, w.Body.String())
	}
	for _, body := range []string{"", "null", "{}", `{"proxy":null}`, `{"proxy":"","unknown":true}`, `{"proxy":""} {}`, `{"proxy":"http://user:private-value@host:7891"}`} {
		w = aiTestRequest(r, http.MethodPut, "/english-radio/settings", body, admin)
		if w.Code != http.StatusBadRequest || strings.Contains(w.Body.String(), "private-value") {
			t.Fatal("invalid proxy not rejected safely")
		}
	}
	w = aiTestRequest(englishRadioTestRouter(ds), http.MethodGet, "/english-radio/settings", "", admin)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "https://proxy.example:443") || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("saved proxy did not persist")
	}
	w = aiTestRequest(r, http.MethodPut, "/english-radio/settings", `{"proxy":""}`, admin)
	if w.Code != http.StatusOK {
		t.Fatal("direct connection setting rejected")
	}
}
