package nativeapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/deluan/rest"
	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/core/onlinecover"
)

func (api *Router) addOnlineCoverSettingsRoutes(r chi.Router, catalog *onlinecover.Catalog) {
	r.With(adminOnlyMiddleware).Get("/online-cover/settings", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		settings, err := catalog.Settings(r.Context())
		if err != nil {
			onlineCoverError(w, err)
			return
		}
		_ = rest.RespondWithJSON(w, http.StatusOK, settings)
	})
	r.With(adminOnlyMiddleware).Put("/online-cover/settings", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		var input struct {
			Proxy *string `json:"proxy"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil || input.Proxy == nil {
			onlineCoverError(w, onlinecover.ErrInvalidSelection)
			return
		}
		if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
			onlineCoverError(w, onlinecover.ErrInvalidSelection)
			return
		}
		settings, err := catalog.UpdateSettings(r.Context(), *input.Proxy)
		if err != nil {
			onlineCoverError(w, err)
			return
		}
		_ = rest.RespondWithJSON(w, http.StatusOK, settings)
	})
}
