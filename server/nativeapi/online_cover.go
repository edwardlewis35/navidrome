package nativeapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/deluan/rest"
	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/core/artwork"
	"github.com/navidrome/navidrome/core/onlinecover"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
)

type onlineCoverRequest struct {
	Kind      string `json:"kind"`
	ID        string `json:"id"`
	Query     string `json:"query,omitempty"`
	ReleaseID string `json:"releaseId,omitempty"`
}

type onlineCoverEntity struct {
	title, artist, releaseID string
	kind                     model.Kind
}

func (api *Router) onlineCoverEntity(ctx context.Context, kind, id string, write bool) (onlineCoverEntity, error) {
	user, ok := request.UserFrom(ctx)
	if !ok || user.ID == "" {
		return onlineCoverEntity{}, rest.ErrPermissionDenied
	}
	if kind != "playlist" {
		if _, err := onlinecover.RelativePath(kind, id); err != nil {
			return onlineCoverEntity{}, err
		}
	}
	if write && kind != "playlist" && !user.IsAdmin {
		return onlineCoverEntity{}, rest.ErrPermissionDenied
	}
	switch kind {
	case "song":
		mf, err := api.ds.MediaFile().Get(ctx, id)
		if err != nil {
			return onlineCoverEntity{}, err
		}
		if mf.Missing || mf.Trashed || !user.HasLibraryAccess(mf.LibraryID) {
			return onlineCoverEntity{}, model.ErrNotFound
		}
		title := mf.Album
		if title == "" {
			title = mf.Title
		}
		artist := mf.AlbumArtist
		if artist == "" {
			artist = mf.Artist
		}
		return onlineCoverEntity{title: title, artist: artist, releaseID: mf.MbzAlbumID, kind: model.KindMediaFileArtwork}, nil
	case "album":
		al, err := api.ds.Album().Get(ctx, id)
		if err != nil {
			return onlineCoverEntity{}, err
		}
		if al.Missing || !user.HasLibraryAccess(al.LibraryID) {
			return onlineCoverEntity{}, model.ErrNotFound
		}
		return onlineCoverEntity{title: al.Name, artist: al.AlbumArtist, releaseID: al.MbzAlbumID, kind: model.KindAlbumArtwork}, nil
	case "playlist":
		pl, err := api.playlists.Get(ctx, id)
		if err != nil {
			return onlineCoverEntity{}, err
		}
		if !user.IsAdmin && !pl.Public && pl.OwnerID != user.ID {
			return onlineCoverEntity{}, model.ErrNotFound
		}
		if write && (!user.IsAdmin && (pl.OwnerID != user.ID || !conf.Server.EnableArtworkUpload)) {
			return onlineCoverEntity{}, rest.ErrPermissionDenied
		}
		return onlineCoverEntity{title: pl.Name, kind: model.KindPlaylistArtwork}, nil
	default:
		return onlineCoverEntity{}, onlinecover.ErrInvalidSelection
	}
}

func decodeOnlineCover(w http.ResponseWriter, r *http.Request) (onlineCoverRequest, bool) {
	var body onlineCoverRequest
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
	d.DisallowUnknownFields()
	if err := d.Decode(&body); err != nil {
		onlineCoverError(w, onlinecover.ErrInvalidSelection)
		return body, false
	}
	var extra any
	if err := d.Decode(&extra); !errors.Is(err, io.EOF) {
		onlineCoverError(w, onlinecover.ErrInvalidSelection)
		return body, false
	}
	if body.ID == "" || len(body.ID) > 128 || len([]rune(body.Query)) > 200 {
		onlineCoverError(w, onlinecover.ErrInvalidSelection)
		return body, false
	}
	return body, true
}

func quoteCoverQuery(s string) string {
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(strings.TrimSpace(s)) + `"`
}

type onlineCoverCatalogue interface {
	Search(context.Context, string, string) ([]onlinecover.Candidate, error)
	Download(context.Context, string) ([]byte, error)
}

func (api *Router) addOnlineCoverRoutes(r chi.Router) {
	catalog := onlinecover.NewStoredCatalog(api.ds.Property(), conf.Server.OnlineCoverProxy)
	api.addOnlineCoverSettingsRoutes(r, catalog)
	api.addOnlineCoverRoutesWithCatalogue(r, catalog)
}

func (api *Router) addOnlineCoverRoutesWithCatalogue(r chi.Router, catalog onlineCoverCatalogue) {
	r.Post("/online-cover/search", func(w http.ResponseWriter, r *http.Request) {
		body, ok := decodeOnlineCover(w, r)
		if !ok {
			return
		}
		entity, err := api.onlineCoverEntity(r.Context(), body.Kind, body.ID, false)
		if err != nil {
			onlineCoverError(w, err)
			return
		}
		title := strings.TrimSpace(body.Query)
		if title == "" {
			title = entity.title
		}
		query := "release:" + quoteCoverQuery(title)
		if entity.artist != "" {
			query += " AND artist:" + quoteCoverQuery(entity.artist)
		}
		releaseID := ""
		if strings.TrimSpace(body.Query) == "" {
			releaseID = entity.releaseID
		}
		results, err := catalog.Search(r.Context(), query, releaseID)
		if err != nil {
			onlineCoverError(w, err)
			return
		}
		for i := range results {
			if results[i].Title == query {
				results[i].Title = title
				results[i].Artist = entity.artist
			}
		}
		_ = rest.RespondWithJSON(w, http.StatusOK, map[string]any{"query": title, "candidates": results})
	})
	r.Post("/online-cover/apply", func(w http.ResponseWriter, r *http.Request) {
		body, ok := decodeOnlineCover(w, r)
		if !ok {
			return
		}
		entity, err := api.onlineCoverEntity(r.Context(), body.Kind, body.ID, true)
		if err != nil {
			onlineCoverError(w, err)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
		defer cancel()
		data, err := catalog.Download(ctx, body.ReleaseID)
		if err != nil {
			onlineCoverError(w, err)
			return
		}
		if body.Kind == "playlist" {
			err = api.playlists.SetImage(ctx, body.ID, bytes.NewReader(data), ".jpg")
		} else {
			err = onlinecover.Save(body.Kind, body.ID, data)
			if err == nil {
				err = artwork.Refresh(ctx, api.ds, entity.kind, body.ID)
			}
		}
		if err != nil {
			onlineCoverError(w, err)
			return
		}
		_ = rest.RespondWithJSON(w, http.StatusOK, map[string]any{"id": body.ID, "saved": true, "refreshQueued": true})
	})
}

func onlineCoverError(w http.ResponseWriter, err error) {
	status, message := http.StatusInternalServerError, "Could not update the cover. Please retry."
	switch {
	case errors.Is(err, rest.ErrPermissionDenied), errors.Is(err, model.ErrNotAuthorized):
		status, message = http.StatusForbidden, "You cannot change this cover."
	case errors.Is(err, model.ErrNotFound):
		status, message = http.StatusNotFound, "Music or playlist not found."
	case errors.Is(err, onlinecover.ErrInvalidSelection):
		status, message = http.StatusBadRequest, "Invalid cover search or selection."
	case errors.Is(err, onlinecover.ErrBusy):
		status, message = http.StatusTooManyRequests, "Cover catalogue is busy. Please retry shortly."
	case errors.Is(err, onlinecover.ErrUnavailable):
		status, message = http.StatusBadGateway, "Cover catalogue is unavailable. Please retry later."
	}
	_ = rest.RespondWithJSON(w, status, map[string]string{"error": message})
}
