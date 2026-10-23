package nativeapi

import (
	"errors"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"strconv"

	"github.com/deluan/rest"
	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/core"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
)

func (api *Router) addMusicUploadRoutes(r chi.Router) {
	r.With(adminOnlyMiddleware).Post("/library/{id}/upload", api.uploadMusic)
	r.With(adminOnlyMiddleware).Post("/library/{id}/upload/scan", api.scanUploadedMusic)
}

func (api *Router) musicUploader(w http.ResponseWriter, r *http.Request) (core.MusicUploader, int, bool) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || id <= 0 {
		musicUploadError(w, r, core.ErrMusicUploadInvalid)
		return nil, 0, false
	}
	uploader, ok := api.libs.(core.MusicUploader)
	if !ok {
		_ = rest.RespondWithJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "Music uploads are unavailable"})
		return nil, 0, false
	}
	return uploader, id, true
}

func (api *Router) uploadMusic(w http.ResponseWriter, r *http.Request) {
	uploader, id, ok := api.musicUploader(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, core.MaxMusicUploadSize+1024*1024)
	reader, err := r.MultipartReader()
	if err != nil {
		musicUploadError(w, r, core.ErrMusicUploadInvalid)
		return
	}
	part, err := reader.NextPart()
	if err != nil {
		musicUploadError(w, r, core.ErrMusicUploadInvalid)
		return
	}
	defer part.Close()
	_, params, err := mime.ParseMediaType(part.Header.Get("Content-Disposition"))
	if err != nil || part.FormName() != "file" || params["filename"] == "" {
		musicUploadError(w, r, core.ErrMusicUploadInvalid)
		return
	}
	result, err := uploader.UploadMusic(r.Context(), id, r.URL.Query().Get("folder"), params["filename"], part)
	if err != nil {
		musicUploadError(w, r, err)
		return
	}
	_ = rest.RespondWithJSON(w, http.StatusCreated, result)
}

func (api *Router) scanUploadedMusic(w http.ResponseWriter, r *http.Request) {
	uploader, id, ok := api.musicUploader(w, r)
	if !ok {
		return
	}
	warnings, err := uploader.ScanUploadedMusic(r.Context(), id, r.URL.Query().Get("folder"))
	if err != nil {
		musicUploadError(w, r, err)
		return
	}
	_ = rest.RespondWithJSON(w, http.StatusOK, map[string]any{"scanComplete": true, "warnings": warnings})
}

func musicUploadError(w http.ResponseWriter, r *http.Request, err error) {
	status, message := http.StatusInternalServerError, "The upload or library refresh could not finish. Check server logs."
	var tooLarge *http.MaxBytesError
	switch {
	case errors.Is(err, core.ErrTrashUnauthorized):
		status, message = http.StatusUnauthorized, "Authentication required"
	case errors.Is(err, core.ErrTrashForbidden), errors.Is(err, fs.ErrPermission):
		status, message = http.StatusForbidden, "Administrator privileges and writable library permissions are required"
	case errors.Is(err, core.ErrMusicUploadTooLarge), errors.As(err, &tooLarge):
		status, message = http.StatusRequestEntityTooLarge, core.ErrMusicUploadTooLarge.Error()
	case errors.Is(err, core.ErrMusicUploadInvalid), errors.Is(err, core.ErrTrashUnsafePath):
		status, message = http.StatusBadRequest, core.ErrMusicUploadInvalid.Error()
	case errors.Is(err, fs.ErrExist), errors.Is(err, core.ErrTrashConflict):
		status, message = http.StatusConflict, "A file already exists at this destination. Nothing was overwritten."
	case errors.Is(err, model.ErrNotFound), errors.Is(err, fs.ErrNotExist):
		status, message = http.StatusNotFound, "The local library or destination folder does not exist"
	case errors.Is(err, io.ErrUnexpectedEOF):
		status, message = http.StatusBadRequest, "The upload was interrupted before the file was complete"
	}
	log.Warn(r.Context(), "Music upload operation failed", err)
	_ = rest.RespondWithJSON(w, status, map[string]string{"error": message})
}
