package core

import (
	"bytes"
	"context"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	"github.com/navidrome/navidrome/tests"
)

func uploadFixture(t *testing.T) (*libraryService, context.Context, string, *tests.MockScanner) {
	t.Helper()
	music := t.TempDir()
	libs := &tests.MockLibraryRepo{}
	libs.SetData(model.Libraries{{ID: 1, Name: "Fixture", Path: music}})
	scan := tests.NewMockScanner()
	ds := &tests.MockDataStore{MockedLibrary: libs}
	return &libraryService{ds: ds, repo: &libraryRepositoryWrapper{scanner: scan}}, request.WithUser(t.Context(), model.User{ID: "admin", IsAdmin: true}), music, scan
}

func TestMusicUploadPublishesAndScansSelectedLibrary(t *testing.T) {
	service, ctx, music, scan := uploadFixture(t)
	if err := os.Mkdir(filepath.Join(music, "Album"), 0700); err != nil {
		t.Fatal(err)
	}
	payload := []byte("fLaC isolated fixture metadata and audio")
	result, err := service.UploadMusic(ctx, 1, "Album", "歌曲.flac", bytes.NewReader(payload))
	if err != nil || !result.Saved || !result.ScanComplete {
		t.Fatalf("%+v %v", result, err)
	}
	data, err := os.ReadFile(filepath.Join(music, "Album", "歌曲.flac"))
	if err != nil || !bytes.Equal(data, payload) {
		t.Fatalf("payload mismatch: %v", err)
	}
	calls := scan.GetScanFoldersCalls()
	if len(calls) != 1 || calls[0].Targets[0].LibraryID != 1 || calls[0].Targets[0].FolderPath != "Album" {
		t.Fatalf("wrong scan: %+v", calls)
	}
	files, err := os.ReadDir(filepath.Join(music, "Album"))
	if err != nil || len(files) != 1 {
		t.Fatalf("staging file retained: %+v %v", files, err)
	}
	_, err = service.UploadMusic(ctx, 1, "Album", "歌曲.flac", strings.NewReader("fLaC replacement"))
	if !errors.Is(err, ErrTrashConflict) {
		t.Fatalf("overwrite accepted: %v", err)
	}
	data, _ = os.ReadFile(filepath.Join(music, "Album", "歌曲.flac"))
	if !bytes.Equal(data, payload) {
		t.Fatal("original replaced")
	}
}

func TestMusicUploadRejectsUnauthorisedUnsafeAndNonAudio(t *testing.T) {
	service, ctx, music, scan := uploadFixture(t)
	for _, userCtx := range []context.Context{t.Context(), request.WithUser(t.Context(), model.User{ID: "regular"})} {
		if _, err := service.UploadMusic(userCtx, 1, "", "song.flac", strings.NewReader("fLaC audio")); err == nil {
			t.Fatal("non-admin upload accepted")
		}
	}
	for _, pair := range [][2]string{{"../outside", "song.flac"}, {"", "../song.flac"}, {"", "song\\evil.flac"}, {"", ".song.flac"}, {"", "script.html"}, {"a/../b", "song.flac"}, {"", "song:evil.flac"}} {
		if _, err := service.UploadMusic(ctx, 1, pair[0], pair[1], strings.NewReader("fLaC audio")); err == nil {
			t.Fatalf("accepted unsafe path: %+v", pair)
		}
	}
	if _, err := service.UploadMusic(ctx, 1, "", "song.mp3", strings.NewReader("<html>not audio</html>")); !errors.Is(err, ErrMusicUploadInvalid) {
		t.Fatalf("accepted non-audio: %v", err)
	}
	if err := os.Symlink(t.TempDir(), filepath.Join(music, "linked")); err != nil {
		t.Fatal(err)
	}
	if _, err := service.UploadMusic(ctx, 1, "linked", "song.flac", strings.NewReader("fLaC audio")); err == nil {
		t.Fatal("accepted symlink destination")
	}
	if scan.GetScanFoldersCallCount() != 0 {
		t.Fatal("invalid uploads triggered scan")
	}
	files, _ := os.ReadDir(music)
	if len(files) != 1 || files[0].Name() != "linked" {
		t.Fatalf("invalid upload left files: %+v", files)
	}
}

type uploadBrokenReader struct{ read bool }

func (r *uploadBrokenReader) Read(b []byte) (int, error) {
	if !r.read {
		r.read = true
		return copy(b, []byte("fLaC incomplete")), nil
	}
	return 0, io.ErrUnexpectedEOF
}

func TestMusicUploadLimitCancellationAndInterruptedStreamCleanStaging(t *testing.T) {
	_, ctx, music, _ := uploadFixture(t)
	root, err := os.OpenRoot(music)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	if _, err = publishMusicUpload(ctx, root, "large.flac", strings.NewReader("fLaC"+strings.Repeat("x", 1024)), 100); !errors.Is(err, ErrMusicUploadTooLarge) {
		t.Fatalf("size bound failed: %v", err)
	}
	if _, err = publishMusicUpload(ctx, root, "partial.flac", &uploadBrokenReader{}, 1024); !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatalf("stream error lost: %v", err)
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err = publishMusicUpload(cancelled, root, "cancel.flac", strings.NewReader("fLaC audio"), 1024); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation lost: %v", err)
	}
	entries, _ := os.ReadDir(music)
	if len(entries) != 0 {
		t.Fatalf("failed uploads left files: %+v", entries)
	}
}

type failingUploadScanner struct{ *tests.MockScanner }

func (s failingUploadScanner) ScanFolders(context.Context, bool, []model.ScanTarget) ([]string, error) {
	return nil, errors.New("fixture scan failure")
}

func TestMusicUploadDistinguishesSavedFileFromScanFailure(t *testing.T) {
	service, ctx, music, _ := uploadFixture(t)
	service.repo.scanner = failingUploadScanner{tests.NewMockScanner()}
	result, err := service.UploadMusic(ctx, 1, "", "saved.flac", strings.NewReader("fLaC audio"))
	if err != nil || !result.Saved || result.ScanComplete || result.ScanError == "" {
		t.Fatalf("saved file misreported: %+v %v", result, err)
	}
	if _, err := os.Stat(filepath.Join(music, "saved.flac")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(music, ".nd-upload")); !errors.Is(err, fs.ErrNotExist) {
		t.Fatal("unexpected temp directory")
	}
}
