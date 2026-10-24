package core

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"testing"

	"github.com/navidrome/navidrome/model"
)

func TestSongTrashPermanentDeleteAndRetry(t *testing.T) {
	f := newSongTrashFixture(t)
	entry, err := f.service.Delete(f.ctx, "song")
	if err != nil {
		t.Fatal(err)
	}
	// A newly created file at the old path is unrelated to the trash payload.
	replacement := []byte("replacement music survives permanent trash deletion")
	if err := os.WriteFile(filepath.Join(f.music, f.path), replacement, 0600); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		got, err := f.service.Purge(f.ctx, entry.ID)
		if err != nil || got.ID != entry.ID {
			t.Fatalf("purge retry: %+v %v", got, err)
		}
	}
	if _, found := f.ds.repo.Data["song"]; found {
		t.Fatal("purged identity remains")
	}
	if _, err := os.Stat(filepath.Join(f.data, "song-trash", entry.ID, "audio")); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("payload remains: %v", err)
	}
	assertSongTrashContent(t, filepath.Join(f.music, f.path), replacement)
	if _, err := f.service.Restore(f.ctx, entry.ID); !errors.Is(err, model.ErrNotFound) {
		t.Fatalf("restore after purge: %v", err)
	}
	if entries, err := f.service.List(f.ctx); err != nil || len(entries) != 0 {
		t.Fatalf("list after purge: %+v %v", entries, err)
	}
}

func TestSongTrashPurgeRejectsRestoredEntriesAndInvalidIDs(t *testing.T) {
	f := newSongTrashFixture(t)
	entry, err := f.service.Delete(f.ctx, "song")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.service.Restore(f.ctx, entry.ID); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{entry.ID, "../../outside", "00000000-0000-0000-0000-000000000000"} {
		if _, err := f.service.Purge(f.ctx, id); !errors.Is(err, model.ErrNotFound) {
			t.Fatalf("purge %q: %v", id, err)
		}
	}
	if count, err := f.service.Clear(f.ctx, nil); err != nil || count != 0 {
		t.Fatalf("clear restored: %d %v", count, err)
	}
	assertSongTrashContent(t, filepath.Join(f.music, f.path), f.content)
	if f.ds.repo.Data["song"].Trashed {
		t.Fatal("restored row changed")
	}
}

func TestSongTrashPurgeNeverDeletesLiveIdentity(t *testing.T) {
	f := newSongTrashFixture(t)
	entry, err := f.service.Delete(f.ctx, "song")
	if err != nil {
		t.Fatal(err)
	}
	// Defensive protection against stale/tampered journal state.
	f.ds.repo.Data["song"].Trashed = false
	if _, err := f.service.Purge(f.ctx, entry.ID); !errors.Is(err, ErrTrashConflict) {
		t.Fatalf("got %v", err)
	}
	assertSongTrashContent(t, filepath.Join(f.data, "song-trash", entry.ID, "audio"), f.content)
	if _, exists := f.ds.repo.Data["song"]; !exists {
		t.Fatal("live identity removed")
	}
}

func TestSongTrashPurgeFailureRecoveryDoesNotNeedLibrary(t *testing.T) {
	for _, scenario := range []string{"database", "commit", "unlink", "after unlink"} {
		t.Run(scenario, func(t *testing.T) {
			f := newSongTrashFixture(t)
			entry, err := f.service.Delete(f.ctx, "song")
			if err != nil {
				t.Fatal(err)
			}
			switch scenario {
			case "database":
				f.ds.repo.failPurge = true
			case "commit":
				f.ds.failCommit = true
			case "unlink":
				f.service.remove = func(*os.Root, string) error { return fs.ErrPermission }
			case "after unlink":
				f.service.remove = func(root *os.Root, name string) error {
					if err := root.Remove(name); err != nil {
						return err
					}
					return errors.New("injected interruption after unlink")
				}
			}
			if _, err := f.service.Purge(f.ctx, entry.ID); err == nil {
				t.Fatal("expected purge failure")
			}
			if scenario == "database" || scenario == "commit" {
				assertSongTrashContent(t, filepath.Join(f.data, "song-trash", entry.ID, "audio"), f.content)
				if !f.ds.repo.Data["song"].Trashed {
					t.Fatal("failed DB transaction changed marker")
				}
			}
			f.ds.repo.failPurge, f.ds.failCommit = false, false
			// Purging recovery is independent of library availability or path identity.
			if err := os.Rename(f.music, f.music+"-offline"); err != nil {
				t.Fatal(err)
			}
			fresh := NewSongTrash(f.ds, f.data)
			if err := fresh.Recover(f.ctx); err != nil {
				t.Fatal(err)
			}
			if _, exists := f.ds.repo.Data["song"]; exists {
				t.Fatal("recovery did not finish DB cleanup")
			}
			if _, err := os.Stat(filepath.Join(f.data, "song-trash", entry.ID, "audio")); !errors.Is(err, fs.ErrNotExist) {
				t.Fatalf("payload remains: %v", err)
			}
			if _, err := fresh.Restore(f.ctx, entry.ID); !errors.Is(err, model.ErrNotFound) {
				t.Fatalf("purged audio was recoverable: %v", err)
			}
		})
	}
}

func TestSongTrashClearSelectedSnapshotAndPartialFailure(t *testing.T) {
	f := newSongTrashFixture(t)
	first, err := f.service.Delete(f.ctx, "song")
	if err != nil {
		t.Fatal(err)
	}
	f.ds.repo.Data["new-song"] = &model.MediaFile{ID: "new-song", LibraryID: 1, Path: "later.mp3"}
	if err := os.WriteFile(filepath.Join(f.music, "later.mp3"), []byte("later trash fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	later, err := f.service.Delete(f.ctx, "new-song")
	if err != nil {
		t.Fatal(err)
	}
	if deleted, err := f.service.Clear(f.ctx, []string{}); err != nil || deleted != 0 {
		t.Fatalf("explicit empty selection: %d %v", deleted, err)
	}
	if deleted, err := f.service.Clear(f.ctx, []string{first.ID, first.ID}); err != nil || deleted != 1 {
		t.Fatalf("selection: %d %v", deleted, err)
	}
	assertSongTrashContent(t, filepath.Join(f.data, "song-trash", later.ID, "audio"), []byte("later trash fixture"))
	if entries, err := f.service.List(f.ctx); err != nil || len(entries) != 1 || entries[0].ID != later.ID {
		t.Fatalf("new entry should survive: %+v %v", entries, err)
	}
	if deleted, err := f.service.Clear(f.ctx, nil); err != nil || deleted != 1 {
		t.Fatalf("clear remainder: %d %v", deleted, err)
	}
	if deleted, err := f.service.Clear(f.ctx, nil); err != nil || deleted != 0 {
		t.Fatalf("clear empty: %d %v", deleted, err)
	}
}

func TestSongTrashClearReportsCompletedCount(t *testing.T) {
	f := newSongTrashFixture(t)
	for _, id := range []string{"song", "second", "third"} {
		if id != "song" {
			f.ds.repo.Data[id] = &model.MediaFile{ID: id, LibraryID: 1, Path: id + ".mp3"}
			if err := os.WriteFile(filepath.Join(f.music, id+".mp3"), f.content, 0600); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := f.service.Delete(f.ctx, id); err != nil {
			t.Fatal(err)
		}
	}
	calls := 0
	f.service.remove = func(root *os.Root, name string) error {
		calls++
		if calls == 2 {
			return fs.ErrPermission
		}
		return root.Remove(name)
	}
	deleted, err := f.service.Clear(f.ctx, nil)
	if deleted != 1 || !errors.Is(err, fs.ErrPermission) {
		t.Fatalf("partial result: %d %v", deleted, err)
	}
	// First fully removed, second pending with recovery bytes, third untouched.
	payloads := 0
	entries, err := os.ReadDir(filepath.Join(f.data, "song-trash"))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if _, err := os.Stat(filepath.Join(f.data, "song-trash", entry.Name(), "audio")); err == nil {
			payloads++
		}
	}
	if payloads != 2 {
		t.Fatalf("expected pending and untouched payloads, got %d", payloads)
	}
	if len(f.ds.repo.Data) != 1 {
		t.Fatalf("only untouched DB row should remain: %+v", f.ds.repo.Data)
	}
	if entries, err := NewSongTrash(f.ds, f.data).List(f.ctx); err != nil || len(entries) != 1 {
		t.Fatalf("recovery should finish only confirmed pending entry: %+v %v", entries, err)
	}
}
