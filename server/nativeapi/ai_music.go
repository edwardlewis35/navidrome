package nativeapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/deluan/rest"
	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/core"
	"github.com/navidrome/navidrome/model"
)

func (api *Router) addAIMusicRoutes(r chi.Router) {
	svc := core.NewAIMusic(api.ds, conf.Server.DataFolder.String())
	r.Route("/ai", func(r chi.Router) {
		r.Get("/status", func(w http.ResponseWriter, r *http.Request) {
			status, err := svc.Status(r.Context())
			aiMusicRespond(w, status, err)
		})
		r.With(adminOnlyMiddleware).Get("/settings", func(w http.ResponseWriter, r *http.Request) {
			settings, err := svc.Settings(r.Context())
			aiMusicRespond(w, settings, err)
		})
		r.With(adminOnlyMiddleware).Put("/settings", func(w http.ResponseWriter, r *http.Request) {
			var update core.AIMusicSettingsUpdate
			if !aiMusicDecode(w, r, &update) {
				return
			}
			settings, err := svc.UpdateSettings(r.Context(), update)
			aiMusicRespond(w, settings, err)
		})
		r.Post("/recommendations", func(w http.ResponseWriter, r *http.Request) {
			var input struct {
				PlaylistID string `json:"playlistId"`
			}
			if !aiMusicDecode(w, r, &input) {
				return
			}
			result, err := svc.Recommend(r.Context(), input.PlaylistID)
			aiMusicRespond(w, result, err)
		})
	})
}

func aiMusicDecode(w http.ResponseWriter, r *http.Request, value any) bool {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 16<<10))
	if err != nil || bytes.Equal(bytes.TrimSpace(body), []byte("null")) {
		aiMusicRespond(w, nil, model.ErrValidation)
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		aiMusicRespond(w, nil, model.ErrValidation)
		return false
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		aiMusicRespond(w, nil, model.ErrValidation)
		return false
	}
	return true
}

func aiMusicRespond(w http.ResponseWriter, value any, err error) {
	w.Header().Set("Cache-Control", "no-store")
	if err == nil {
		_ = rest.RespondWithJSON(w, http.StatusOK, value)
		return
	}
	status, code := http.StatusInternalServerError, "ai_error"
	switch {
	case errors.Is(err, core.ErrAIUnauthorized):
		status, code = http.StatusUnauthorized, "authentication_required"
	case errors.Is(err, core.ErrAIForbidden):
		status, code = http.StatusForbidden, "administrator_required"
	case errors.Is(err, model.ErrNotFound):
		status, code = http.StatusNotFound, "playlist_not_found"
	case errors.Is(err, model.ErrValidation), errors.Is(err, core.ErrAIInvalidSettings):
		status, code = http.StatusBadRequest, "invalid_settings"
	case errors.Is(err, core.ErrAINotConfigured):
		status, code = http.StatusConflict, "not_configured"
	case errors.Is(err, core.ErrAIEmptyPlaylist):
		status, code = http.StatusBadRequest, "empty_playlist"
	case errors.Is(err, core.ErrAIBusy):
		status, code = http.StatusTooManyRequests, "busy"
	case errors.Is(err, core.ErrAIUnavailable):
		status, code = http.StatusBadGateway, "provider_unavailable"
	case errors.Is(err, core.ErrAIInvalidResponse):
		status, code = http.StatusBadGateway, "invalid_response"
	}
	// Provider response bodies, credentials and URLs are deliberately excluded from errors.
	_ = rest.RespondWithJSON(w, status, map[string]string{"error": code})
}
