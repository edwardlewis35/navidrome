package core

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/navidrome/navidrome/model"
)

const MaxMusicUploadSize int64 = 512 * 1024 * 1024

var (
	ErrMusicUploadInvalid  = errors.New("invalid audio file, filename or destination folder")
	ErrMusicUploadTooLarge = errors.New("audio files must not exceed 512 MiB")
)

// MusicUploader is an optional extension of the library service. Existing library
// and Subsonic interfaces remain unchanged.
type MusicUploader interface {
	UploadMusic(context.Context, int, string, string, io.Reader) (*MusicUploadResult, error)
	ScanUploadedMusic(context.Context, int, string) ([]string, error)
}

type MusicUploadResult struct {
	LibraryID    int      `json:"libraryId"`
	Path         string   `json:"path"`
	Size         int64    `json:"size"`
	Saved        bool     `json:"saved"`
	ScanComplete bool     `json:"scanComplete"`
	ScanError    string   `json:"scanError,omitempty"`
	Warnings     []string `json:"warnings,omitempty"`
}

func musicUploadPath(folder, name string) (string, error) {
	if folder == "" {
		folder = "."
	}
	if !filepath.IsLocal(folder) || strings.Contains(folder, "\\") || len(folder) > 1024 || strings.IndexFunc(folder, unicode.IsControl) >= 0 {
		return "", ErrMusicUploadInvalid
	}
	for _, part := range strings.Split(filepath.ToSlash(folder), "/") {
		if part != "." && (strings.HasPrefix(part, ".") || strings.ContainsAny(part, ":\x00")) {
			return "", ErrMusicUploadInvalid
		}
	}
	if !filepath.IsLocal(name) || len(name) > 255 || strings.HasPrefix(name, ".") || strings.ContainsAny(name, "/\\:") || strings.IndexFunc(name, unicode.IsControl) >= 0 {
		return "", ErrMusicUploadInvalid
	}
	return filepath.Join(folder, name), nil
}

func musicUploadHeader(name string, b []byte) bool {
	has := func(v string) bool { return bytes.HasPrefix(b, []byte(v)) }
	switch strings.ToLower(filepath.Ext(name)) {
	case ".mp3":
		return has("ID3") || (len(b) > 1 && b[0] == 0xff && b[1]&0xe0 == 0xe0)
	case ".flac":
		return has("fLaC")
	case ".ogg", ".opus", ".oga":
		return has("OggS")
	case ".wav":
		return len(b) >= 12 && has("RIFF") && string(b[8:12]) == "WAVE"
	case ".aif", ".aiff", ".aifc":
		return len(b) >= 12 && has("FORM") && (string(b[8:12]) == "AIFF" || string(b[8:12]) == "AIFC")
	case ".m4a", ".m4b", ".mp4", ".alac":
		return len(b) >= 12 && string(b[4:8]) == "ftyp"
	case ".aac":
		return len(b) > 1 && b[0] == 0xff && b[1]&0xf0 == 0xf0
	case ".ape":
		return has("MAC ")
	case ".wv":
		return has("wvpk")
	case ".dsf":
		return has("DSD ")
	case ".dff":
		return has("FRM8")
	case ".wma":
		return has("\x30\x26\xb2\x75\x8e\x66\xcf\x11")
	default:
		return false
	}
}

type musicUploadReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r musicUploadReader) Read(b []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(b)
}

func publishMusicUpload(ctx context.Context, root *os.Root, path string, input io.Reader, limit int64) (int64, error) {
	dir := filepath.Dir(path)
	// Directory handles pin the destination even if its name is concurrently
	// replaced. Refuse every symlink component before opening it.
	if err := trashNoSymlinks(root, dir); err != nil {
		return 0, err
	}
	destination, err := root.OpenRoot(dir)
	if err != nil {
		return 0, err
	}
	defer destination.Close()
	name := filepath.Base(path)
	if _, err := destination.Lstat(name); !errors.Is(err, fs.ErrNotExist) {
		if err == nil {
			return 0, ErrTrashConflict
		}
		return 0, err
	}
	temp := ".nd-upload-" + uuid.NewString() + ".part"
	file, err := destination.OpenFile(temp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return 0, err
	}
	defer destination.Remove(temp) // Only the unique unpublished staging name.
	reader := io.LimitReader(musicUploadReader{ctx, input}, limit+1)
	header := make([]byte, 512)
	n, readErr := io.ReadFull(reader, header)
	if readErr != nil && !errors.Is(readErr, io.ErrUnexpectedEOF) && !errors.Is(readErr, io.EOF) {
		file.Close()
		return 0, readErr
	}
	if !musicUploadHeader(name, header[:n]) {
		file.Close()
		return 0, ErrMusicUploadInvalid
	}
	written, err := io.Copy(file, io.MultiReader(bytes.NewReader(header[:n]), reader))
	if err == nil && written > limit {
		err = ErrMusicUploadTooLarge
	}
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return 0, err
	}
	if err := ctx.Err(); err != nil {
		return 0, err
	}
	// Hard-link publication is atomic and never overwrites an existing file.
	if err := destination.Link(temp, name); err != nil {
		return 0, err
	}
	if err := trashSyncDir(destination, "."); err != nil {
		return written, fmt.Errorf("file saved but directory flush failed: %w", err)
	}
	return written, nil
}

func (s *libraryService) UploadMusic(ctx context.Context, libraryID int, folder, name string, input io.Reader) (*MusicUploadResult, error) {
	if _, err := trashAdmin(ctx); err != nil {
		return nil, err
	}
	path, err := musicUploadPath(folder, name)
	if err != nil {
		return nil, err
	}
	lib, err := s.ds.Library().Get(ctx, libraryID)
	if err != nil {
		return nil, err
	}
	localPath, err := trashLocalRoot(lib.Path)
	if err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(localPath)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	size, err := publishMusicUpload(ctx, root, path, input, MaxMusicUploadSize)
	if err != nil && size == 0 {
		return nil, err
	}
	result := &MusicUploadResult{LibraryID: libraryID, Path: filepath.ToSlash(path), Size: size, Saved: true}
	if err != nil {
		result.ScanError = "File saved, but the destination could not be flushed. Check server logs before retrying."
		return result, nil
	}
	result.Warnings, err = s.ScanUploadedMusic(context.WithoutCancel(ctx), libraryID, filepath.Dir(path))
	result.ScanComplete = err == nil
	if err != nil {
		result.ScanError = "File saved. Library refresh did not finish; use Refresh library to retry without uploading the file again."
	}
	return result, nil
}

func (s *libraryService) ScanUploadedMusic(ctx context.Context, libraryID int, folder string) ([]string, error) {
	if _, err := trashAdmin(ctx); err != nil {
		return nil, err
	}
	if _, err := musicUploadPath(folder, "validation.mp3"); err != nil {
		return nil, err
	}
	if _, err := s.ds.Library().Get(ctx, libraryID); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	for {
		status, err := s.repo.scanner.Status(ctx)
		if err != nil {
			return nil, err
		}
		if !status.Scanning {
			warnings, err := s.repo.scanner.ScanFolders(ctx, false, []model.ScanTarget{{LibraryID: libraryID, FolderPath: folder}})
			if !errors.Is(err, model.ErrAlreadyScanning) {
				return warnings, err
			}
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
}
