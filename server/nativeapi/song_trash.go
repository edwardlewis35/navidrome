package nativeapi

import (
	"errors"
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
}

func songTrashResult(w http.ResponseWriter, entry *core.SongTrashEntry) {
	_ = rest.RespondWithJSON(w, http.StatusOK, struct {
		ID      string `json:"id"`
		TrashID string `json:"trashId"`
	}{ID: entry.MediaFileID, TrashID: entry.ID})
}

func songTrashError(w http.ResponseWriter, r *http.Request, err error) {
	status, message := http.StatusInternalServerError, "The music file could not be moved. Any recovery copy is retained in the trash. Check server logs."
	switch {
	case errors.Is(err, core.ErrTrashUnauthorized):
		status, message = http.StatusUnauthorized, "Authentication required"
	case errors.Is(err, core.ErrTrashForbidden):
		status, message = http.StatusForbidden, "Administrator privileges required"
	case errors.Is(err, core.ErrTrashUnsafePath):
		status, message = http.StatusBadRequest, "Only regular files inside local libraries can be moved. The trash must be outside all music libraries."
	case errors.Is(err, core.ErrTrashConflict):
		status, message = http.StatusConflict, "The original path is occupied or the library changed. No existing file was overwritten."
	case errors.Is(err, model.ErrNotFound), errors.Is(err, fs.ErrNotExist):
		status, message = http.StatusNotFound, "Song, recovery file or music library not found"
	case errors.Is(err, fs.ErrPermission):
		status, message = http.StatusForbidden, "The service does not have permission to move this music file. Check the library and data folder permissions."
	}
	log.Warn(r.Context(), "Song trash operation failed", "method", r.Method, "path", r.URL.Path, err)
	_ = rest.RespondWithJSON(w, status, map[string]string{"error": message})
}
