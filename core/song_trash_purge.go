package core

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/navidrome/navidrome/model"
)

// Purge permanently deletes only an existing trash entry. The journal is kept
// as a tombstone, so a retry can report success without touching music paths.
func (s *SongTrash) Purge(ctx context.Context, trashID string) (*SongTrashEntry, error) {
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
	if j.State == "purged" {
		return &j.SongTrashEntry, nil
	}
	if j.State != "trashed" {
		return nil, model.ErrNotFound
	}
	if err := s.purgeEntry(ctx, trash, j); err != nil {
		return nil, err
	}
	return &j.SongTrashEntry, nil
}

// Clear snapshots the recoverable entries while holding both trash locks.
// Each entry is committed independently; a failure stops before later entries
// and reports the number fully removed so callers can reconcile their view.
func (s *SongTrash) Clear(ctx context.Context, ids []string) (int, error) {
	if _, err := trashAdmin(ctx); err != nil {
		return 0, err
	}
	songTrashMu.Lock()
	defer songTrashMu.Unlock()
	trash, err := s.openTrash(ctx)
	if err != nil {
		return 0, err
	}
	defer trash.Close()
	unlock, err := trashAcquireLock(trash)
	if err != nil {
		return 0, err
	}
	defer unlock()
	if err := s.recover(ctx, trash); err != nil {
		return 0, err
	}
	entries, err := trashReadJournals(trash)
	if err != nil {
		return 0, err
	}
	deleted := 0
	var selected map[string]bool
	if ids != nil {
		selected = make(map[string]bool, len(ids))
		for _, id := range ids {
			if !trashValidID(id) {
				return 0, ErrTrashUnsafePath
			}
			selected[id] = true
		}
	}
	for _, j := range entries {
		if j.State != "trashed" || (selected != nil && !selected[j.ID]) {
			continue
		}
		if err := s.purgeEntry(ctx, trash, j); err != nil {
			return deleted, err
		}
		deleted++
	}
	return deleted, nil
}

// A durable purging journal is an irrevocable administrator intent. Commit the
// guarded DB cleanup first: if SQLite rejects it, the recovery bytes survive.
// After a commit, unlink only UUID/audio and flush its directory. Any crash or
// failure is completed by recovery; this path never opens the music library.
func (s *SongTrash) purgeEntry(ctx context.Context, trash *os.Root, j *songTrashJournal) error {
	payload := filepath.Join(j.ID, "audio")
	if err := trashNoSymlinks(trash, j.ID); err != nil {
		return err
	}
	if info, err := trash.Lstat(payload); err == nil {
		if !info.Mode().IsRegular() {
			return ErrTrashUnsafePath
		}
	} else if !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	if j.State != "purging" {
		j.State = "purging"
		if err := trashWriteJournal(trash, j); err != nil {
			return err
		}
	}
	if err := s.ds.WithTxImmediate(func(tx model.DataStore) error {
		return tx.MediaFile().PurgeTrashed(ctx, j.MediaFileID)
	}); err != nil {
		if errors.Is(err, model.ErrNotTrashed) {
			// Nothing irreversible happened. A restored identity must remain live.
			j.State = "trashed"
			if writeErr := trashWriteJournal(trash, j); writeErr != nil {
				return errors.Join(ErrTrashConflict, writeErr)
			}
			return ErrTrashConflict
		}
		return err
	}
	if err := s.remove(trash, payload); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	if err := trashSyncDir(trash, j.ID); err != nil {
		return err
	}
	j.State = "purged"
	return trashWriteJournal(trash, j)
}
