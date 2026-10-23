package nativeapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"

	"github.com/deluan/rest"
	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/core"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/server"
)

func (api *Router) addSongTrashRoutes(r chi.Router) {
	trash := core.NewSongTrash(api.ds, conf.Server.DataFolder.String())
	r.Route("/song", func(r chi.Router) {
		r.Get("/", rest.GetAll(api.ds.MediaFile()))
		r.Route("/{id}", func(r chi.Router) {
			r.Use(server.URLParamsMiddleware)
			r.Get("/", rest.Get(api.ds.MediaFile()))
			r.With(adminOnlyMiddleware).Delete("/", func(w http.ResponseWriter, r *http.Request) {
				entry, err := trash.Delete(r.Context(), chi.URLParam(r, "id"))
				if err != nil {
					songTrashError(w, r, err)
					return
				}
				songTrashResult(w, entry)
			})
		})
	})
	r.With(adminOnlyMiddleware).Get("/trash", func(w http.ResponseWriter, r *http.Request) {
		entries, err := trash.List(r.Context())
		if err != nil {
			songTrashError(w, r, err)
			return
		}
		_ = rest.RespondWithJSON(w, http.StatusOK, entries)
	})
	r.With(adminOnlyMiddleware).Post("/trash/{id}/restore", func(w http.ResponseWriter, r *http.Request) {
		entry, err := trash.Restore(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			songTrashError(w, r, err)
			return
		}
		songTrashResult(w, entry)
	})
	r.With(adminOnlyMiddleware).Delete("/trash/{id}", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := songTrashConfirmation(w, r); !ok {
			return
		}
		entry, err := trash.Purge(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			songTrashError(w, r, err)
			return
		}
		_ = rest.RespondWithJSON(w, http.StatusOK, map[string]string{"id": entry.ID, "mediaFileId": entry.MediaFileID})
	})
	r.With(adminOnlyMiddleware).Delete("/trash", func(w http.ResponseWriter, r *http.Request) {
		confirmation, ok := songTrashConfirmation(w, r)
		if !ok {
			return
		}
		deleted, err := trash.Clear(r.Context(), confirmation.IDs)
		if err != nil {
			songTrashError(w, r, err, deleted)
			return
		}
		_ = rest.RespondWithJSON(w, http.StatusOK, map[string]int{"deleted": deleted})
	})
}

type songTrashConfirmationBody struct {
	Confirm bool     `json:"confirm"`
	IDs     []string `json:"ids"`
}

func songTrashConfirmation(w http.ResponseWriter, r *http.Request) (songTrashConfirmationBody, bool) {
	var body songTrashConfirmationBody
	var raw struct {
		Confirm bool            `json:"confirm"`
		IDs     json.RawMessage `json:"ids"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&raw); err != nil || !raw.Confirm {
		_ = rest.RespondWithJSON(w, http.StatusBadRequest, map[string]string{"error": "Permanent deletion requires JSON confirmation: {\"confirm\":true}"})
		return body, false
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		_ = rest.RespondWithJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid deletion confirmation"})
		return body, false
	}
	body.Confirm = raw.Confirm
	if raw.IDs != nil {
		if bytes.Equal(bytes.TrimSpace(raw.IDs), []byte("null")) || json.Unmarshal(raw.IDs, &body.IDs) != nil {
			_ = rest.RespondWithJSON(w, http.StatusBadRequest, map[string]string{"error": "Trash selection must be an array of UUIDs"})
			return body, false
		}
	}
	return body, true
}

func songTrashResult(w http.ResponseWriter, entry *core.SongTrashEntry) {
	_ = rest.RespondWithJSON(w, http.StatusOK, struct {
		ID      string `json:"id"`
		TrashID string `json:"trashId"`
	}{ID: entry.MediaFileID, TrashID: entry.ID})
}

func songTrashError(w http.ResponseWriter, r *http.Request, err error, deleted ...int) {
	status, message := http.StatusInternalServerError, "The trash operation could not finish. Refresh the trash list and check server logs. An interrupted confirmed permanent deletion will finish during recovery."
	switch {
	case errors.Is(err, core.ErrTrashUnauthorized):
		status, message = http.StatusUnauthorized, "Authentication required"
	case errors.Is(err, core.ErrTrashForbidden):
		status, message = http.StatusForbidden, "Administrator privileges required"
	case errors.Is(err, core.ErrTrashUnsafePath):
		status, message = http.StatusBadRequest, "The song or trash path is unsafe, the trash selection is invalid, or the trash is inside a music library."
	case errors.Is(err, core.ErrTrashConflict):
		status, message = http.StatusConflict, "The original path is occupied or the library changed. No existing file was overwritten."
	case errors.Is(err, model.ErrNotFound), errors.Is(err, fs.ErrNotExist):
		status, message = http.StatusNotFound, "Song, recovery file or music library not found"
	case errors.Is(err, fs.ErrPermission):
		status, message = http.StatusForbidden, "The service does not have permission to access or update this song or its recovery file. Check the library and data folder permissions."
	}
	log.Warn(r.Context(), "Song trash operation failed", "method", r.Method, "path", r.URL.Path, err)
	body := map[string]any{"error": message}
	if len(deleted) > 0 {
		body["deleted"] = deleted[0]
	}
	_ = rest.RespondWithJSON(w, status, body)
}
