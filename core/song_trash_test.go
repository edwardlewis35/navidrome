package core

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
	"github.com/navidrome/navidrome/tests"
)

type trashTestRepository struct {
	*tests.MockMediaFileRepo
	failDelete  bool
	failRestore bool
	failPurge   bool
}

func (r *trashTestRepository) PurgeTrashed(ctx context.Context, id string) error {
	if r.failPurge {
		return errors.New("injected purge database error")
	}
	return r.MockMediaFileRepo.PurgeTrashed(ctx, id)
}

func (r *trashTestRepository) SetTrashed(ctx context.Context, id string, trashed bool) error {
	if (trashed && r.failDelete) || (!trashed && r.failRestore) {
		return errors.New("injected database error")
	}
	return r.MockMediaFileRepo.SetTrashed(ctx, id, trashed)
}

type trashTestStore struct {
	*tests.MockDataStore
	repo         *trashTestRepository
	failCommit   bool
	beforeCommit func()
}

func (s *trashTestStore) WithTxImmediate(block func(model.DataStore) error, _ ...string) error {
	before := make(map[string]*model.MediaFile, len(s.repo.Data))
	for id, mf := range s.repo.Data {
		clone := *mf
		before[id] = &clone
	}
	err := block(s)
	if err == nil && s.beforeCommit != nil {
		s.beforeCommit()
	}
	if err == nil && s.failCommit {
		err = errors.New("injected commit error")
	}
	if err != nil {
		s.repo.Data = before
	}
	return err
}

type songTrashFixture struct {
	service *SongTrash
	ds      *trashTestStore
	ctx     context.Context
	music   string
	data    string
	path    string
	content []byte
}

func newSongTrashFixture(t *testing.T) *songTrashFixture {
	t.Helper()
	base := t.TempDir()
	f := &songTrashFixture{music: filepath.Join(base, "music"), data: filepath.Join(base, "data"), path: filepath.Join("artist", "album", "track.mp3"), content: []byte("isolated test song; never production music")}
	if err := os.MkdirAll(filepath.Join(f.music, "artist", "album"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(f.data, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(f.music, f.path), f.content, 0644); err != nil {
		t.Fatal(err)
	}
	repo := &trashTestRepository{MockMediaFileRepo: tests.CreateMockMediaFileRepo()}
	repo.SetData(model.MediaFiles{{ID: "song", LibraryID: 1, Path: f.path, Title: "Fixture song", Artist: "Fixture artist", Album: "Fixture album"}})
	libs := &tests.MockLibraryRepo{}
	libs.SetData(model.Libraries{{ID: 1, Name: "Fixture library", Path: f.music}})
	f.ds = &trashTestStore{MockDataStore: &tests.MockDataStore{MockedMediaFile: repo, MockedLibrary: libs}, repo: repo}
	f.service = NewSongTrash(f.ds, f.data)
	f.ctx = request.WithUser(t.Context(), model.User{ID: "admin", UserName: "fixture-admin", IsAdmin: true})
	return f
}

func assertSongTrashContent(t *testing.T, path string, content []byte) {
	t.Helper()
	actual, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(actual) != string(content) {
		t.Fatalf("unexpected fixture bytes: %q", actual)
	}
}

func TestSongTrashRoundTripAndRestart(t *testing.T) {
	f := newSongTrashFixture(t)
	entry, err := f.service.Delete(f.ctx, "song")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(f.music, f.path)); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("original should be moved, got %v", err)
	}
	assertSongTrashContent(t, filepath.Join(f.data, "song-trash", entry.ID, "audio"), f.content)
	if !f.ds.repo.Data["song"].Trashed || !f.ds.repo.Data["song"].Missing {
		t.Fatal("retained row must be trashed and missing")
	}
	if entry.MediaFileID != "song" || entry.DeletedBy != "fixture-admin" {
		t.Fatalf("wrong entry: %+v", entry)
	}
	// A fresh service reads the durable journal, without any in-memory state.
	f.service = NewSongTrash(f.ds, f.data)
	entries, err := f.service.List(f.ctx)
	if err != nil || len(entries) != 1 {
		t.Fatalf("durable list: %+v, %v", entries, err)
	}
	if _, err := f.service.Restore(f.ctx, entry.ID); err != nil {
		t.Fatal(err)
	}
	assertSongTrashContent(t, filepath.Join(f.music, f.path), f.content)
	if f.ds.repo.Data["song"].Trashed || f.ds.repo.Data["song"].Missing {
		t.Fatal("restored row must retain identity and be available")
	}
	entries, err = f.service.List(f.ctx)
	if err != nil || entries == nil || len(entries) != 0 {
		t.Fatalf("expected JSON [] compatible empty list, got %+v %v", entries, err)
	}
}

func TestSongTrashRequiresAdminInService(t *testing.T) {
	f := newSongTrashFixture(t)
	for _, tc := range []struct {
		name string
		ctx  context.Context
		want error
	}{
		{"unauthenticated", t.Context(), ErrTrashUnauthorized},
		{"regular user", request.WithUser(t.Context(), model.User{ID: "regular"}), ErrTrashForbidden},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := f.service.Delete(tc.ctx, "song"); !errors.Is(err, tc.want) {
				t.Fatalf("delete got %v", err)
			}
			if _, err := f.service.List(tc.ctx); !errors.Is(err, tc.want) {
				t.Fatalf("list got %v", err)
			}
			if _, err := f.service.Restore(tc.ctx, "invalid"); !errors.Is(err, tc.want) {
				t.Fatalf("restore got %v", err)
			}
			if _, err := f.service.Purge(tc.ctx, "invalid"); !errors.Is(err, tc.want) {
				t.Fatalf("purge got %v", err)
			}
			if _, err := f.service.Clear(tc.ctx, nil); !errors.Is(err, tc.want) {
				t.Fatalf("clear got %v", err)
			}
		})
	}
	assertSongTrashContent(t, filepath.Join(f.music, f.path), f.content)
	if _, err := os.Stat(filepath.Join(f.data, "song-trash")); !errors.Is(err, fs.ErrNotExist) {
		t.Fatal("unauthorized requests touched the filesystem")
	}
}

func TestSongTrashRejectsPathsAndSymlinks(t *testing.T) {
	for _, unsafe := range []string{"../outside.mp3", "/etc/passwd", "artist/../../../outside.mp3"} {
		t.Run(unsafe, func(t *testing.T) {
			f := newSongTrashFixture(t)
			f.ds.repo.Data["song"].Path = unsafe
			if _, err := f.service.Delete(f.ctx, "song"); !errors.Is(err, ErrTrashUnsafePath) {
				t.Fatalf("got %v", err)
			}
			assertSongTrashContent(t, filepath.Join(f.music, f.path), f.content)
		})
	}
	t.Run("symlink file", func(t *testing.T) {
		f := newSongTrashFixture(t)
		outside := filepath.Join(t.TempDir(), "outside.mp3")
		if err := os.WriteFile(outside, f.content, 0644); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(outside, filepath.Join(f.music, "linked.mp3")); err != nil {
			t.Fatal(err)
		}
		f.ds.repo.Data["song"].Path = "linked.mp3"
		if _, err := f.service.Delete(f.ctx, "song"); !errors.Is(err, ErrTrashUnsafePath) {
			t.Fatalf("got %v", err)
		}
		assertSongTrashContent(t, outside, f.content)
	})
	t.Run("symlink ancestor", func(t *testing.T) {
		f := newSongTrashFixture(t)
		if err := os.Symlink(filepath.Join(f.music, "artist"), filepath.Join(f.music, "linked")); err != nil {
			t.Fatal(err)
		}
		f.ds.repo.Data["song"].Path = filepath.Join("linked", "album", "track.mp3")
		if _, err := f.service.Delete(f.ctx, "song"); !errors.Is(err, ErrTrashUnsafePath) {
			t.Fatalf("got %v", err)
		}
	})
	t.Run("remote library", func(t *testing.T) {
		f := newSongTrashFixture(t)
		f.ds.MockedLibrary.(*tests.MockLibraryRepo).Data[1] = model.Library{ID: 1, Path: "s3://fixture/music"}
		if _, err := f.service.Delete(f.ctx, "song"); !errors.Is(err, ErrTrashUnsafePath) {
			t.Fatalf("got %v", err)
		}
	})
	t.Run("trash inside library", func(t *testing.T) {
		f := newSongTrashFixture(t)
		f.service.dataFolder = filepath.Join(f.music, "data")
		if err := os.Mkdir(f.service.dataFolder, 0700); err != nil {
			t.Fatal(err)
		}
		if _, err := f.service.Delete(f.ctx, "song"); !errors.Is(err, ErrTrashUnsafePath) {
			t.Fatalf("got %v", err)
		}
	})
}

func TestSongTrashMissingAndNonRegularFiles(t *testing.T) {
	f := newSongTrashFixture(t)
	f.ds.repo.Data["song"].Path = "absent.mp3"
	if _, err := f.service.Delete(f.ctx, "song"); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("got %v", err)
	}
	f.ds.repo.Data["song"].Path = "artist"
	if _, err := f.service.Delete(f.ctx, "song"); !errors.Is(err, ErrTrashUnsafePath) {
		t.Fatalf("got %v", err)
	}
}

func TestSongTrashDeleteRollback(t *testing.T) {
	for _, scenario := range []string{"database", "readonly source", "commit"} {
		t.Run(scenario, func(t *testing.T) {
			f := newSongTrashFixture(t)
			switch scenario {
			case "database":
				f.ds.repo.failDelete = true
			case "readonly source":
				f.service.remove = func(*os.Root, string) error { return fs.ErrPermission }
			case "commit":
				f.ds.failCommit = true
			}
			if _, err := f.service.Delete(f.ctx, "song"); err == nil {
				t.Fatal("expected failure")
			}
			assertSongTrashContent(t, filepath.Join(f.music, f.path), f.content)
			if f.ds.repo.Data["song"].Trashed {
				t.Fatal("database marker survived rollback")
			}
			entries, err := f.service.List(f.ctx)
			if err != nil || len(entries) != 0 {
				t.Fatalf("failed operation left active trash: %+v %v", entries, err)
			}
		})
	}
}

func TestSongTrashRestoreNeverOverwritesAndRetainsRecovery(t *testing.T) {
	f := newSongTrashFixture(t)
	entry, err := f.service.Delete(f.ctx, "song")
	if err != nil {
		t.Fatal(err)
	}
	replacement := []byte("new occupant must survive")
	if err := os.WriteFile(filepath.Join(f.music, f.path), replacement, 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := f.service.Restore(f.ctx, entry.ID); !errors.Is(err, ErrTrashConflict) {
		t.Fatalf("got %v", err)
	}
	assertSongTrashContent(t, filepath.Join(f.music, f.path), replacement)
	assertSongTrashContent(t, filepath.Join(f.data, "song-trash", entry.ID, "audio"), f.content)
}

func TestSongTrashDeleteRollbackKeepsPayloadWhenPathBecomesOccupied(t *testing.T) {
	f := newSongTrashFixture(t)
	replacement := []byte("another writer occupied the original path")
	f.ds.failCommit = true
	f.ds.beforeCommit = func() {
		if err := os.WriteFile(filepath.Join(f.music, f.path), replacement, 0644); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.service.Delete(f.ctx, "song"); err == nil {
		t.Fatal("expected failed commit")
	}
	assertSongTrashContent(t, filepath.Join(f.music, f.path), replacement)
	entries, err := os.ReadDir(filepath.Join(f.data, "song-trash"))
	if err != nil {
		t.Fatal(err)
	}
	var journals []string
	for _, entry := range entries {
		if trashValidID(entry.Name()) {
			journals = append(journals, entry.Name())
		}
	}
	if len(journals) != 1 {
		t.Fatal("missing recovery journal")
	}
	assertSongTrashContent(t, filepath.Join(f.data, "song-trash", journals[0], "audio"), f.content)
}

func TestSongTrashRestoreRollback(t *testing.T) {
	for _, scenario := range []string{"database", "commit"} {
		t.Run(scenario, func(t *testing.T) {
			f := newSongTrashFixture(t)
			entry, err := f.service.Delete(f.ctx, "song")
			if err != nil {
				t.Fatal(err)
			}
			f.ds.repo.failRestore = scenario == "database"
			f.ds.failCommit = scenario == "commit"
			if _, err := f.service.Restore(f.ctx, entry.ID); err == nil {
				t.Fatal("expected failure")
			}
			if _, err := os.Stat(filepath.Join(f.music, f.path)); !errors.Is(err, fs.ErrNotExist) {
				t.Fatalf("restore rollback left source, %v", err)
			}
			assertSongTrashContent(t, filepath.Join(f.data, "song-trash", entry.ID, "audio"), f.content)
			if !f.ds.repo.Data["song"].Trashed {
				t.Fatal("restore rollback lost marker")
			}
		})
	}
}

func TestSongTrashRejectsCorruptPayloadAndInvalidIDs(t *testing.T) {
	f := newSongTrashFixture(t)
	entry, err := f.service.Delete(f.ctx, "song")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.service.Restore(f.ctx, "../../etc/passwd"); !errors.Is(err, model.ErrNotFound) {
		t.Fatalf("got %v", err)
	}
	if err := os.WriteFile(filepath.Join(f.data, "song-trash", entry.ID, "audio"), []byte("corrupt"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := f.service.Restore(f.ctx, entry.ID); err == nil || !strings.Contains(err.Error(), "integrity") {
		t.Fatalf("got %v", err)
	}
	if _, err := os.Stat(filepath.Join(f.music, f.path)); !errors.Is(err, fs.ErrNotExist) {
		t.Fatal("corrupt payload was restored")
	}
}

func TestSongTrashRecoversInterruptedTransitions(t *testing.T) {
	for _, scenario := range []string{"deleted before journal finalize", "restored before journal finalize", "copy before digest finalize"} {
		t.Run(scenario, func(t *testing.T) {
			f := newSongTrashFixture(t)
			entry, err := f.service.Delete(f.ctx, "song")
			if err != nil {
				t.Fatal(err)
			}
			root, err := f.service.openTrash(f.ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer root.Close()
			j, err := trashReadJournal(root, entry.ID)
			if err != nil {
				t.Fatal(err)
			}
			j.State = "prepared"
			if scenario != "deleted before journal finalize" {
				if err := os.WriteFile(filepath.Join(f.music, f.path), f.content, 0644); err != nil {
					t.Fatal(err)
				}
				j.State = "restoring"
			}
			if scenario == "copy before digest finalize" {
				j.State, j.SHA256 = "prepared", ""
			}
			if err := trashWriteJournal(root, j); err != nil {
				t.Fatal(err)
			}
			entries, err := NewSongTrash(f.ds, f.data).List(f.ctx)
			if err != nil {
				t.Fatal(err)
			}
			if scenario == "deleted before journal finalize" {
				if len(entries) != 1 {
					t.Fatal("lost recoverable deletion")
				}
			} else {
				if len(entries) != 0 || f.ds.repo.Data["song"].Trashed {
					t.Fatal("did not finish interrupted restore")
				}
				assertSongTrashContent(t, filepath.Join(f.music, f.path), f.content)
			}
		})
	}
}

func TestSongTrashStartupRecoveryRestoresMarkerBeforeCleanup(t *testing.T) {
	f := newSongTrashFixture(t)
	entry, err := f.service.Delete(f.ctx, "song")
	if err != nil {
		t.Fatal(err)
	}
	root, err := f.service.openTrash(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	j, err := trashReadJournal(root, entry.ID)
	if err != nil {
		t.Fatal(err)
	}
	j.State = "prepared"
	if err := trashWriteJournal(root, j); err != nil {
		t.Fatal(err)
	}
	// Simulate process exit after source unlink, before the SQLite commit.
	f.ds.repo.Data["song"].Trashed, f.ds.repo.Data["song"].Missing = false, false
	if err := NewSongTrash(f.ds, f.data).Recover(f.ctx); err != nil {
		t.Fatal(err)
	}
	if !f.ds.repo.Data["song"].Trashed || !f.ds.repo.Data["song"].Missing {
		t.Fatal("startup did not protect retained song before scanner cleanup")
	}
	assertSongTrashContent(t, filepath.Join(f.data, "song-trash", entry.ID, "audio"), f.content)
}

func TestSongTrashCrossProcessLock(t *testing.T) {
	path := t.TempDir()
	root, err := os.OpenRoot(path)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	unlock, err := trashAcquireLock(root)
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	child := exec.Command(os.Args[0], "-test.run=^TestSongTrashLockHelper$") //nolint:gosec // Re-run this test binary against an isolated temporary lock directory.
	child.Env = append(os.Environ(), "NAVIDROME_TRASH_LOCK_HELPER="+path)
	done := make(chan error, 1)
	if err := child.Start(); err != nil {
		t.Fatal(err)
	}
	go func() { done <- child.Wait() }()
	select {
	case err := <-done:
		t.Fatalf("another process bypassed the held trash lock: %v", err)
	case <-time.After(150 * time.Millisecond):
	}
	unlock()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		_ = child.Process.Kill()
		t.Fatal("another process could not acquire the released trash lock")
	}
}

func TestSongTrashLockHelper(t *testing.T) {
	path := os.Getenv("NAVIDROME_TRASH_LOCK_HELPER")
	if path == "" {
		return
	}
	root, err := os.OpenRoot(path)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	unlock, err := trashAcquireLock(root)
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
}

func TestSongTrashDirectorySyncDoesNotSwallowInvalidFileErrors(t *testing.T) {
	file, err := os.Create(filepath.Join(t.TempDir(), "closed-file"))
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if err := trashSyncDirectory(file); err == nil {
		t.Fatal("directory sync helper swallowed an invalid ordinary file handle")
	}
}
