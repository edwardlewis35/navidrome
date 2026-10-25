package nativeapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/core/onlinecover"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/tests"
)

func TestOnlineCoverSettingsAdminPersistenceAndValidation(t *testing.T) {
	t.Cleanup(conf.SnapshotConfig())
	conf.Server.OnlineCoverProxy = "http://server.example:7891"
	ds := &tests.MockDataStore{}
	router := func() http.Handler {
		r := chi.NewRouter()
		(&Router{ds: ds}).addOnlineCoverRoutes(r)
		return r
	}
	r := router()
	admin := model.User{ID: "admin", IsAdmin: true}
	for _, user := range []model.User{{}, {ID: "listener"}} {
		for _, method := range []string{http.MethodGet, http.MethodPut} {
			w := aiTestRequest(r, method, "/online-cover/settings", `{"proxy":""}`, user)
			if w.Code != http.StatusForbidden {
				t.Fatalf("non-admin %s: %d", method, w.Code)
			}
		}
	}
	check := func(r http.Handler, method, body, proxy, source string) {
		t.Helper()
		w := aiTestRequest(r, method, "/online-cover/settings", body, admin)
		var got onlinecover.Settings
		if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &got) != nil || got.Proxy != proxy || got.Source != source || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("unexpected settings: %d %s", w.Code, w.Body.String())
		}
	}
	check(r, http.MethodGet, "", conf.Server.OnlineCoverProxy, "server")
	check(r, http.MethodPut, `{"proxy":"https://saved.example:443"}`, "https://saved.example:443", "saved")
	for _, body := range []string{``, `null`, `{}`, `{"proxy":null}`, `{"proxy":7}`, `{"proxy":"","extra":true}`, `{"proxy":""} {}`, `{"proxy":"http://user:private-value@host:7891"}`, `{"proxy":"socks5://host:7891"}`, `{"proxy":"http://host:7891/path"}`, `{"proxy":"http://host:7891?x=y"}`, `{"proxy":"http://host:7891#x"}`, `{"proxy":"http://host"}`, `{"proxy":"` + strings.Repeat("x", 2049) + `"}`} {
		w := aiTestRequest(r, http.MethodPut, "/online-cover/settings", body, admin)
		if w.Code != http.StatusBadRequest || strings.Contains(w.Body.String(), "private-value") {
			t.Fatalf("invalid settings: %d %s", w.Code, w.Body.String())
		}
		check(r, http.MethodGet, "", "https://saved.example:443", "saved")
	}
	check(router(), http.MethodGet, "", "https://saved.example:443", "saved")
	check(r, http.MethodPut, `{"proxy":""}`, "", "saved")
	check(router(), http.MethodGet, "", "", "saved")
}
