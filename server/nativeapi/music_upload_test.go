package nativeapi

import (
	"bytes"
	"context"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/navidrome/navidrome/core"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
)

type uploadStub struct {
	core.Library
	calls        int
	name, folder string
}

func (s *uploadStub) UploadMusic(_ context.Context, _ int, folder, name string, input io.Reader) (*core.MusicUploadResult, error) {
	s.calls++
	s.name = name
	s.folder = folder
	if strings.ContainsAny(name, "/\\") {
		return nil, core.ErrMusicUploadInvalid
	}
	b, err := io.ReadAll(input)
	if err != nil {
		return nil, err
	}
	return &core.MusicUploadResult{Saved: true, Size: int64(len(b)), ScanComplete: true}, nil
}
func (s *uploadStub) ScanUploadedMusic(context.Context, int, string) ([]string, error) {
	s.calls++
	return nil, nil
}
func TestMusicUploadStreamsMultipartAndPreservesRawUnsafeFilename(t *testing.T) {
	stub := &uploadStub{}
	api := &Router{libs: stub}
	router := chi.NewRouter()
	api.addMusicUploadRoutes(router)
	for _, name := range []string{"song.flac", "../outside.flac"} {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, err := writer.CreateFormFile("file", name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := io.WriteString(part, "fLaC fixture"); err != nil {
			t.Fatal(err)
		}
		if err := writer.Close(); err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodPost, "/library/1/upload?folder=Artist%2FAlbum", &body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req = req.WithContext(request.WithUser(t.Context(), model.User{ID: "admin", IsAdmin: true}))
		out := httptest.NewRecorder()
		router.ServeHTTP(out, req)
		expected := http.StatusCreated
		if strings.Contains(name, "/") {
			expected = http.StatusBadRequest
		}
		if out.Code != expected || stub.name != name || stub.folder != "Artist/Album" {
			t.Fatalf("upload %s: %d %s raw=%s folder=%s", name, out.Code, out.Body.String(), stub.name, stub.folder)
		}
	}
	for _, path := range []string{"/library/1/upload", "/library/1/upload/scan"} {
		before := stub.calls
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader("ignored"))
		req = req.WithContext(request.WithUser(t.Context(), model.User{ID: "regular"}))
		out := httptest.NewRecorder()
		router.ServeHTTP(out, req)
		if out.Code != http.StatusForbidden || stub.calls != before {
			t.Fatal("non-admin upload/scan permitted")
		}
	}
}
