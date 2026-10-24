package nativeapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/deluan/rest"
	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/core/englishradio"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	"github.com/navidrome/navidrome/server"
)

const radioTicketCookie = "nd_english_radio_ticket"

func radioStreamPath(id string) string {
	return strings.TrimRight(conf.Server.BasePath, "/") + "/api/english-radio/stream/" + id
}

func (api *Router) addEnglishRadioProtectedRoutes(r chi.Router, service *englishradio.Service) {
	r.Get("/english-radio/catalog", func(w http.ResponseWriter, r *http.Request) {
		if user, ok := request.UserFrom(r.Context()); !ok || user.ID == "" {
			radioRespond(w, nil, englishradio.ErrUnauthorized)
			return
		}
		radioRespond(w, map[string]any{"stations": englishradio.Catalog()}, nil)
	})
	r.With(adminOnlyMiddleware).Get("/english-radio/settings", func(w http.ResponseWriter, r *http.Request) {
		settings, err := service.Settings(r.Context())
		radioRespond(w, settings, err)
	})
	r.With(adminOnlyMiddleware).Put("/english-radio/settings", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Proxy *string `json:"proxy"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil || input.Proxy == nil {
			radioRespond(w, nil, englishradio.ErrInvalidSettings)
			return
		}
		if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
			radioRespond(w, nil, englishradio.ErrInvalidSettings)
			return
		}
		settings, err := service.UpdateSettings(r.Context(), *input.Proxy)
		radioRespond(w, settings, err)
	})
	r.Post("/english-radio/play/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParamFromCtx(r.Context(), "id")
		value, err := service.Ticket(r.Context(), id)
		if err != nil {
			radioRespond(w, nil, err)
			return
		}
		scheme, _ := server.ServerAddress(r)
		path := radioStreamPath(id)
		http.SetCookie(w, &http.Cookie{Name: radioTicketCookie, Value: value, Path: path, HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: scheme == "https", MaxAge: int(englishradio.TicketLifetime.Seconds()), Expires: time.Now().Add(englishradio.TicketLifetime)}) // #nosec G124 -- Secure follows actual HTTPS; local HTTP playback is supported. HttpOnly and SameSite are always set.
		radioRespond(w, map[string]string{"streamUrl": path}, nil)
	})
}

func (api *Router) addEnglishRadioStreamRoute(r chi.Router, service *englishradio.Service) {
	r.Get("/english-radio/stream/{id}", func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(radioTicketCookie)
		// The outer request logger can trace request headers. Never leave this
		// short-lived playback capability in the request it records.
		r.Header.Del("Cookie")
		if err != nil {
			radioRespond(w, nil, englishradio.ErrUnauthorized)
			return
		}
		stream, contentType, err := service.Open(r.Context(), chi.URLParamFromCtx(r.Context(), "id"), cookie.Value)
		if err != nil {
			radioRespond(w, nil, err)
			return
		}
		defer stream.Close() //nolint:errcheck // The client may disconnect at any point in a live stream.
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Accel-Buffering", "no")
		w.Header().Set("Accept-Ranges", "none")
		_, _ = io.Copy(&radioFlushWriter{ResponseWriter: w}, stream)
	})
}

type radioFlushWriter struct{ http.ResponseWriter }

func (w *radioFlushWriter) Write(data []byte) (int, error) {
	n, err := w.ResponseWriter.Write(data)
	if err == nil {
		_ = http.NewResponseController(w.ResponseWriter).Flush()
	}
	return n, err
}

func radioRespond(w http.ResponseWriter, value any, err error) {
	w.Header().Set("Cache-Control", "no-store")
	if err == nil {
		_ = rest.RespondWithJSON(w, http.StatusOK, value)
		return
	}
	status, code := http.StatusInternalServerError, "radio_error"
	switch {
	case errors.Is(err, englishradio.ErrUnauthorized):
		status, code = http.StatusUnauthorized, "authentication_required"
	case errors.Is(err, englishradio.ErrForbidden), errors.Is(err, rest.ErrPermissionDenied):
		status, code = http.StatusForbidden, "administrator_required"
	case errors.Is(err, englishradio.ErrInvalidSettings):
		status, code = http.StatusBadRequest, "invalid_proxy"
	case errors.Is(err, model.ErrNotFound):
		status, code = http.StatusNotFound, "station_not_found"
	case errors.Is(err, englishradio.ErrBusy):
		status, code = http.StatusTooManyRequests, "busy"
	case errors.Is(err, englishradio.ErrUnavailable):
		status, code = http.StatusBadGateway, "stream_unavailable"
	}
	_ = rest.RespondWithJSON(w, status, map[string]string{"error": code})
}
