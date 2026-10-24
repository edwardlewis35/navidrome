package core

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
)

var (
	ErrTrashUnauthorized = errors.New("authentication required")
	ErrTrashForbidden    = errors.New("administrator privileges required")
	ErrTrashUnsafePath   = errors.New("only regular files inside a local music library can be moved to trash")
	ErrTrashConflict     = errors.New("the original path is occupied or the library has changed")
)

// SongTrashEntry is the public, administrator-only view of a recoverable file.
// File locations inside the trash and the integrity digest are deliberately private.
type SongTrashEntry struct {
	ID          string    `json:"id"`
	MediaFileID string    `json:"mediaFileId"`
	Title       string    `json:"title"`
	Artist      string    `json:"artist"`
	Album       string    `json:"album"`
	Path        string    `json:"path"`
	LibraryID   int       `json:"libraryId"`
	DeletedAt   time.Time `json:"deletedAt"`
	DeletedBy   string    `json:"deletedBy"`
}

type songTrashJournal struct {
	SongTrashEntry
	LibraryRoot string `json:"libraryRoot"`
	SHA256      string `json:"sha256"`
	Size        int64  `json:"size"`
	Mode        uint32 `json:"mode"`
	State       string `json:"state"`
}

// SongTrash keeps the original database identity, annotations and playlist rows.
// Its journal is fsynced before removing any source file. Files are copied through
// confined os.Root handles, so different Docker bind mounts are supported.
type SongTrash struct {
	ds         model.DataStore
	dataFolder string
	remove     func(*os.Root, string) error
}

// All instances in this server serialize filesystem/DB transitions. SQLite's
// immediate transaction additionally serializes scanner writes with each change.
var songTrashMu sync.Mutex

func NewSongTrash(ds model.DataStore, dataFolder string) *SongTrash {
	return &SongTrash{ds: ds, dataFolder: dataFolder, remove: func(root *os.Root, name string) error { return root.Remove(name) }}
}

func trashAdmin(ctx context.Context) (model.User, error) {
	user, ok := request.UserFrom(ctx)
	if !ok {
		return model.User{}, ErrTrashUnauthorized
	}
	if !user.IsAdmin {
		return model.User{}, ErrTrashForbidden
	}
	return user, nil
}

func (s *SongTrash) Delete(ctx context.Context, songID string) (*SongTrashEntry, error) {
	user, err := trashAdmin(ctx)
	if err != nil {
		return nil, err
	}
	songTrashMu.Lock()
	defer songTrashMu.Unlock()
	trash, err := s.openTrash(ctx)
	if err != nil {
		return nil, err
	}
	defer trash.Close()
	unlock, err := trashAcquireLock(trash)
	if err != nil {
		return nil, err
	}
	defer unlock()
	if err := s.recover(ctx, trash); err != nil {
		return nil, err
	}
	mf, err := s.ds.MediaFile().Get(ctx, songID)
	if err != nil {
		return nil, err
	}
	lib, err := s.ds.Library().Get(ctx, mf.LibraryID)
	if err != nil {
		return nil, err
	}
	rootPath, err := trashLocalRoot(lib.Path)
	if err != nil {
		return nil, err
	}
	if !filepath.IsLocal(mf.Path) {
		return nil, ErrTrashUnsafePath
	}
	library, err := os.OpenRoot(rootPath)
	if err != nil {
		return nil, err
	}
	defer library.Close()
	if err := trashNoSymlinks(library, mf.Path); err != nil {
		return nil, err
	}
	info, err := library.Lstat(mf.Path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, ErrTrashUnsafePath
	}
	j := songTrashJournal{SongTrashEntry: SongTrashEntry{ID: uuid.NewString(), MediaFileID: mf.ID, Title: mf.Title, Artist: mf.Artist, Album: mf.Album, Path: mf.Path, LibraryID: mf.LibraryID, DeletedAt: time.Now().UTC(), DeletedBy: user.UserName}, LibraryRoot: rootPath, Size: info.Size(), Mode: uint32(info.Mode().Perm()), State: "prepared"}
	if err := trash.Mkdir(j.ID, 0700); err != nil {
		return nil, err
	}
	if err := trashSyncDir(trash, "."); err != nil {
		return nil, err
	}
	if err := trashWriteJournal(trash, &j); err != nil {
		return nil, err
	}
	removed := false
	// Keep the writer lock through copy/removal/commit: a concurrent scan must
	// never purge this retained row between the filesystem and DB changes.
	err = s.ds.WithTxImmediate(func(tx model.DataStore) error {
		if err := tx.MediaFile().SetTrashed(ctx, mf.ID, true); err != nil {
			return err
		}
		if err := trashPreparePayload(library, trash, &j, info); err != nil {
			return err
		}
		if err := s.remove(library, mf.Path); err != nil {
			return err
		}
		removed = true
		if err := trashSyncDir(library, filepath.Dir(mf.Path)); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, trashRollbackDelete(library, trash, &j, info, removed, err)
	}
	j.State = "trashed"
	if err := trashWriteJournal(trash, &j); err != nil {
		return nil, fmt.Errorf("song is recoverable in trash %s; writing final journal: %w", j.ID, err)
	}
	return &j.SongTrashEntry, nil
}

func trashSameSource(expected, actual fs.FileInfo) bool {
	return expected != nil && actual != nil && os.SameFile(expected, actual) && expected.Size() == actual.Size() && expected.ModTime().Equal(actual.ModTime())
}

func trashPreparePayload(library, trash *os.Root, j *songTrashJournal, info fs.FileInfo) error {
	digest, size, err := trashCopy(library, j.Path, trash, filepath.Join(j.ID, "audio"), 0600)
	if err != nil {
		return err
	}
	if size != info.Size() {
		return fmt.Errorf("music file changed during copy")
	}
	j.SHA256 = digest
	if err := trashWriteJournal(trash, j); err != nil {
		return err
	}
	current, err := library.Lstat(j.Path)
	if err != nil {
		return err
	}
	if !trashSameSource(info, current) {
		return fmt.Errorf("music file changed before removal")
	}
	return nil
}

func trashRollbackDelete(library, trash *os.Root, j *songTrashJournal, info fs.FileInfo, removed bool, cause error) error {
	// WithTx has rolled back. Only consume the recovery copy when the original
	// never moved or an exclusive, verified rollback copy restored it.
	payload := filepath.Join(j.ID, "audio")
	current, sourceErr := library.Lstat(j.Path)
	safeOriginal := !removed && sourceErr == nil && trashSameSource(info, current)
	if errors.Is(sourceErr, fs.ErrNotExist) && j.SHA256 != "" {
		if err := trashVerify(trash, payload, j); err != nil {
			return fmt.Errorf("%w; recovery is retained in trash %s: %w", cause, j.ID, err)
		}
		if _, _, err := trashCopy(trash, payload, library, j.Path, fs.FileMode(j.Mode)); err != nil {
			return fmt.Errorf("%w; recovery is retained in trash %s: %w", cause, j.ID, err)
		}
		safeOriginal = true
	}
	if !safeOriginal {
		return fmt.Errorf("%w; original path changed; recovery is retained in trash %s", cause, j.ID)
	}
	_ = trash.Remove(payload)
	j.State = "restored"
	_ = trashWriteJournal(trash, j)
	return cause
}

func (s *SongTrash) List(ctx context.Context) ([]SongTrashEntry, error) {
	if _, err := trashAdmin(ctx); err != nil {
		return nil, err
	}
	songTrashMu.Lock()
	defer songTrashMu.Unlock()
	trash, err := s.openTrash(ctx)
	if err != nil {
		return nil, err
	}
	defer trash.Close()
	unlock, err := trashAcquireLock(trash)
	if err != nil {
		return nil, err
	}
	defer unlock()
	if err := s.recover(ctx, trash); err != nil {
		return nil, err
	}
	journals, err := trashReadJournals(trash)
	if err != nil {
		return nil, err
	}
	entries := make([]SongTrashEntry, 0, len(journals))
	for _, j := range journals {
		if j.State == "trashed" {
			entries = append(entries, j.SongTrashEntry)
		}
	}
	slices.SortFunc(entries, func(a, b SongTrashEntry) int { return b.DeletedAt.Compare(a.DeletedAt) })
	return entries, nil
}

// Recover is called before the server starts and before every scan, including
// standalone scanner subprocesses. It protects journal-backed identities before
// missing-file cleanup has any opportunity to purge a rolled-back DB marker.
func (s *SongTrash) Recover(ctx context.Context) error {
	songTrashMu.Lock()
	defer songTrashMu.Unlock()
	if _, err := os.Lstat(filepath.Join(s.dataFolder, "song-trash")); errors.Is(err, fs.ErrNotExist) {
		return nil
	} else if err != nil {
		return err
	}
	if _, err := trashAdmin(ctx); err != nil {
		return err
	}
	trash, err := s.openTrash(ctx)
	if err != nil {
		return err
	}
	defer trash.Close()
	unlock, err := trashAcquireLock(trash)
	if err != nil {
		return err
	}
	defer unlock()
	return s.recover(ctx, trash)
}

func (s *SongTrash) Restore(ctx context.Context, trashID string) (*SongTrashEntry, error) {
	if _, err := trashAdmin(ctx); err != nil {
		return nil, err
	}
	if !trashValidID(trashID) {
		return nil, model.ErrNotFound
	}
	songTrashMu.Lock()
	defer songTrashMu.Unlock()
	trash, err := s.openTrash(ctx)
	if err != nil {
		return nil, err
	}
	defer trash.Close()
	unlock, err := trashAcquireLock(trash)
	if err != nil {
		return nil, err
	}
	defer unlock()
	if err := s.recover(ctx, trash); err != nil {
		return nil, err
	}
	j, err := trashReadJournal(trash, trashID)
	if err != nil {
		return nil, err
	}
	if j.State != "trashed" {
		return nil, model.ErrNotFound
	}
	library, err := s.journalLibrary(ctx, j)
	if err != nil {
		return nil, err
	}
	defer library.Close()
	if _, err := library.Lstat(j.Path); !errors.Is(err, fs.ErrNotExist) {
		return nil, ErrTrashConflict
	}
	if err := trashNoSymlinks(library, filepath.Dir(j.Path)); err != nil {
		return nil, err
	}
	payload := filepath.Join(j.ID, "audio")
	if err := trashVerify(trash, payload, j); err != nil {
		return nil, err
	}
	j.State = "restoring"
	if err := trashWriteJournal(trash, j); err != nil {
		return nil, err
	}
	var publishedInfo fs.FileInfo
	err = s.ds.WithTxImmediate(func(tx model.DataStore) error {
		digest, size, err := trashCopy(trash, payload, library, j.Path, fs.FileMode(j.Mode))
		if err != nil {
			return err
		}
		publishedInfo, err = library.Lstat(j.Path)
		if err != nil {
			return err
		}
		if digest != j.SHA256 || size != j.Size {
			return fmt.Errorf("trash payload integrity mismatch")
		}
		if err := tx.MediaFile().SetTrashed(ctx, j.MediaFileID, false); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		// A failed commit rolls back the DB but leaves a newly published file.
		// Remove only our verified copy; the recovery payload stays untouched.
		if current, statErr := library.Lstat(j.Path); publishedInfo != nil && statErr == nil && os.SameFile(current, publishedInfo) {
			if cleanupErr := library.Remove(j.Path); cleanupErr != nil {
				return nil, fmt.Errorf("%w; recovery copies retained: %w", err, cleanupErr)
			}
		}
		j.State = "trashed"
		_ = trashWriteJournal(trash, j)
		return nil, err
	}
	// Do not remove the recovery copy until DB commit succeeds.
	if err := s.remove(trash, payload); err != nil {
		return nil, fmt.Errorf("song restored; trash recovery copy retained: %w", err)
	}
	j.State = "restored"
	if err := trashWriteJournal(trash, j); err != nil {
		return nil, err
	}
	return &j.SongTrashEntry, nil
}

func (s *SongTrash) openTrash(ctx context.Context) (*os.Root, error) {
	dataPath, err := filepath.EvalSymlinks(s.dataFolder)
	if err != nil {
		return nil, err
	}
	dataPath, err = filepath.Abs(dataPath)
	if err != nil {
		return nil, err
	}
	trashPath := filepath.Join(dataPath, "song-trash")
	libs, err := s.ds.Library().GetAll(ctx)
	if err != nil {
		return nil, err
	}
	for _, lib := range libs {
		root, err := trashLocalRoot(lib.Path)
		if err != nil {
			continue
		} // Remote libraries cannot contain this local directory.
		rel, err := filepath.Rel(root, trashPath)
		if err == nil && (rel == "." || filepath.IsLocal(rel)) {
			return nil, fmt.Errorf("%w: data trash must be outside every music library", ErrTrashUnsafePath)
		}
	}
	data, err := os.OpenRoot(dataPath)
	if err != nil {
		return nil, err
	}
	defer data.Close()
	if err := data.Mkdir("song-trash", 0700); err != nil && !errors.Is(err, fs.ErrExist) {
		return nil, err
	}
	if err := trashSyncDir(data, "."); err != nil {
		return nil, err
	}
	info, err := data.Lstat("song-trash")
	if err != nil {
		return nil, err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, ErrTrashUnsafePath
	}
	return data.OpenRoot("song-trash")
}

func trashLocalRoot(path string) (string, error) {
	if strings.Contains(path, "://") {
		u, err := url.Parse(path)
		if err != nil || u.Scheme != "file" || (u.Host != "" && u.Host != "localhost") || u.RawQuery != "" || u.Fragment != "" {
			return "", ErrTrashUnsafePath
		}
		path = u.Path
	}
	if !filepath.IsAbs(path) {
		return "", ErrTrashUnsafePath
	}
	root, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	return root, nil
}

func (s *SongTrash) journalLibrary(ctx context.Context, j *songTrashJournal) (*os.Root, error) {
	if !filepath.IsLocal(j.Path) {
		return nil, ErrTrashUnsafePath
	}
	lib, err := s.ds.Library().Get(ctx, j.LibraryID)
	if err != nil {
		return nil, err
	}
	rootPath, err := trashLocalRoot(lib.Path)
	if err != nil {
		return nil, err
	}
	if rootPath != j.LibraryRoot {
		return nil, ErrTrashConflict
	}
	return os.OpenRoot(rootPath)
}

func trashNoSymlinks(root *os.Root, name string) error {
	if name == "." {
		return nil
	}
	if !filepath.IsLocal(name) {
		return ErrTrashUnsafePath
	}
	parts := strings.Split(filepath.Clean(name), string(filepath.Separator))
	for i := range parts {
		info, err := root.Lstat(filepath.Join(parts[:i+1]...))
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return ErrTrashUnsafePath
		}
	}
	return nil
}

// trashCopy publishes the complete file with a hard link: Link is atomic and
// fails when a destination already exists, unlike Rename which may overwrite.
// The staging file lives alongside the destination, so this works across mounts.
func trashCopy(src *os.Root, srcName string, dst *os.Root, dstName string, mode fs.FileMode) (string, int64, error) {
	if err := trashNoSymlinks(src, srcName); err != nil {
		return "", 0, err
	}
	if err := trashNoSymlinks(dst, filepath.Dir(dstName)); err != nil {
		return "", 0, err
	}
	in, err := src.Open(srcName)
	if err != nil {
		return "", 0, err
	}
	defer in.Close()
	info, err := in.Stat()
	if err != nil {
		return "", 0, err
	}
	if !info.Mode().IsRegular() {
		return "", 0, ErrTrashUnsafePath
	}
	tmp := filepath.Join(filepath.Dir(dstName), ".song-trash-"+uuid.NewString()+".tmp")
	out, err := dst.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode&0777)
	if err != nil {
		return "", 0, err
	}
	defer func() { _ = dst.Remove(tmp) }()
	hash := sha256.New()
	size, copyErr := io.Copy(io.MultiWriter(out, hash), in)
	syncErr := out.Sync()
	closeErr := out.Close()
	if err := errors.Join(copyErr, syncErr, closeErr); err != nil {
		return "", 0, err
	}
	if err := dst.Link(tmp, dstName); err != nil {
		if errors.Is(err, fs.ErrExist) {
			return "", 0, ErrTrashConflict
		}
		return "", 0, err
	}
	if err := trashSyncDir(dst, filepath.Dir(dstName)); err != nil {
		_ = dst.Remove(dstName)
		return "", 0, err
	}
	return hex.EncodeToString(hash.Sum(nil)), size, nil
}

func trashVerify(root *os.Root, name string, j *songTrashJournal) error {
	if err := trashNoSymlinks(root, name); err != nil {
		return err
	}
	f, err := root.Open(name)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return ErrTrashUnsafePath
	}
	hash := sha256.New()
	size, err := io.Copy(hash, f)
	if err != nil {
		return err
	}
	if size != j.Size || hex.EncodeToString(hash.Sum(nil)) != j.SHA256 {
		return fmt.Errorf("trash payload integrity mismatch")
	}
	return nil
}

func trashValidID(id string) bool {
	parsed, err := uuid.Parse(id)
	return err == nil && parsed.String() == id
}

func trashWriteJournal(root *os.Root, j *songTrashJournal) error {
	if !trashValidID(j.ID) {
		return ErrTrashUnsafePath
	}
	data, err := json.Marshal(j)
	if err != nil {
		return err
	}
	name := filepath.Join(j.ID, "entry.json")
	tmp := filepath.Join(j.ID, ".entry-"+uuid.NewString()+".tmp")
	f, err := root.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer func() { _ = root.Remove(tmp) }()
	_, writeErr := f.Write(data)
	syncErr := f.Sync()
	closeErr := f.Close()
	if err := errors.Join(writeErr, syncErr, closeErr); err != nil {
		return err
	}
	if err := root.Rename(tmp, name); err != nil {
		return err
	}
	return trashSyncDir(root, j.ID)
}

func trashSyncDir(root *os.Root, name string) error {
	f, err := root.Open(name)
	if err != nil {
		return err
	}
	defer f.Close()
	return trashSyncDirectory(f)
}

// The scanner can run in a subprocess. A process-local mutex cannot prevent it
// from reconciling an HTTP operation's in-flight journal, so share an OS lock.
func trashAcquireLock(root *os.Root) (func(), error) {
	file, err := root.OpenFile(".lock", os.O_RDWR|os.O_CREATE, 0600)
	if err != nil {
		return nil, err
	}
	if err := trashLockFile(file); err != nil {
		_ = file.Close()
		return nil, err
	}
	var once sync.Once
	return func() { once.Do(func() { _ = trashUnlockFile(file); _ = file.Close() }) }, nil
}

func trashReadJournal(root *os.Root, id string) (*songTrashJournal, error) {
	if !trashValidID(id) {
		return nil, model.ErrNotFound
	}
	name := filepath.Join(id, "entry.json")
	if err := trashNoSymlinks(root, name); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, model.ErrNotFound
		}
		return nil, err
	}
	f, err := root.Open(name)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var j songTrashJournal
	if err := json.NewDecoder(io.LimitReader(f, 1024*1024)).Decode(&j); err != nil {
		return nil, err
	}
	if j.ID != id || !filepath.IsLocal(j.Path) || j.MediaFileID == "" {
		return nil, ErrTrashUnsafePath
	}
	if j.State != "prepared" && j.State != "trashed" && j.State != "restoring" && j.State != "restored" && j.State != "purging" && j.State != "purged" {
		return nil, fmt.Errorf("invalid trash journal state")
	}
	return &j, nil
}

func trashReadJournals(root *os.Root) ([]*songTrashJournal, error) {
	dir, err := root.Open(".")
	if err != nil {
		return nil, err
	}
	defer dir.Close()
	entries, err := dir.ReadDir(-1)
	if err != nil {
		return nil, err
	}
	result := make([]*songTrashJournal, 0, len(entries))
	for _, entry := range entries {
		if !trashValidID(entry.Name()) {
			continue
		}
		j, err := trashReadJournal(root, entry.Name())
		if errors.Is(err, model.ErrNotFound) {
			continue
		}
		if err != nil {
			return nil, err
		}
		result = append(result, j)
	}
	return result, nil
}

// recover reconciles interrupted transitions on the next administrator request.
// It never overwrites a path and verifies the recovery copy before using it.
func (s *SongTrash) recover(ctx context.Context, trash *os.Root) error {
	entries, err := trashReadJournals(trash)
	if err != nil {
		return err
	}
	for _, j := range entries {
		if j.State == "trashed" || j.State == "restored" || j.State == "purged" {
			continue
		}
		if j.State == "purging" {
			if err := s.purgeEntry(ctx, trash, j); err != nil {
				return err
			}
			continue
		}
		library, err := s.journalLibrary(ctx, j)
		if err != nil {
			return err
		}
		err = s.recoverEntry(ctx, trash, library, j)
		_ = library.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *SongTrash) recoverEntry(ctx context.Context, trash, library *os.Root, j *songTrashJournal) error {
	payload := filepath.Join(j.ID, "audio")
	_, sourceErr := library.Lstat(j.Path)
	_, payloadErr := trash.Lstat(payload)
	sourceExists, payloadExists := sourceErr == nil, payloadErr == nil
	if sourceErr != nil && !errors.Is(sourceErr, fs.ErrNotExist) {
		return sourceErr
	}
	if payloadErr != nil && !errors.Is(payloadErr, fs.ErrNotExist) {
		return payloadErr
	}
	if !sourceExists && payloadExists {
		if err := trashVerify(trash, payload, j); err != nil {
			return err
		}
		if err := s.ds.WithTxImmediate(func(tx model.DataStore) error { return tx.MediaFile().SetTrashed(ctx, j.MediaFileID, true) }); err != nil {
			return err
		}
		j.State = "trashed"
	} else if sourceExists {
		if payloadExists {
			// An empty digest can only precede source removal. In that window
			// the original is authoritative and the unpublished copy is disposable.
			if j.SHA256 != "" {
				if err := trashVerify(library, j.Path, j); err != nil {
					return fmt.Errorf("%w: interrupted operation left a different file at the original path", ErrTrashConflict)
				}
			}
		}
		if err := s.ds.WithTxImmediate(func(tx model.DataStore) error { return tx.MediaFile().SetTrashed(ctx, j.MediaFileID, false) }); err != nil {
			return err
		}
		if payloadExists {
			if err := trash.Remove(payload); err != nil {
				return err
			}
		}
		j.State = "restored"
	} else {
		return fmt.Errorf("trash %s has neither original nor recovery file", j.ID)
	}
	return trashWriteJournal(trash, j)
}
