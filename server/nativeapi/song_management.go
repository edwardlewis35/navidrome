package nativeapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/deluan/rest"
	"github.com/navidrome/navidrome/core"
)

func manageSongs(trash *core.SongTrash) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			IDs     []string `json:"ids"`
			Mode    string   `json:"mode"`
			Confirm bool     `json:"confirm"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024*1024))
		decoder.DisallowUnknownFields()
		var extra any
		if err := decoder.Decode(&body); err != nil || !body.Confirm || !errors.Is(decoder.Decode(&extra), io.EOF) {
			_ = rest.RespondWithJSON(w, http.StatusBadRequest, map[string]string{"error": "Song management requires a valid selection, mode and explicit confirmation."})
			return
		}
		result, err := trash.Manage(r.Context(), body.IDs, body.Mode)
		if errors.Is(err, core.ErrSongManagementSelection) {
			_ = rest.RespondWithJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if err != nil {
			songTrashError(w, r, err)
			return
		}
		_ = rest.RespondWithJSON(w, http.StatusOK, result)
	}
}
