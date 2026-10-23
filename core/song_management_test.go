package core

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/request"
)

func TestSongManagementPartialSuccessAndPermanentIntent(t *testing.T) {
	f := newSongTrashFixture(t)
	result, err := f.service.Manage(f.ctx, []string{"absent", "song"}, "trash")
	if err != nil || result.Completed != 1 || result.Failed != 1 || result.Results[1].Status != "trashed" {
		t.Fatalf("%+v %v", result, err)
	}
	if _, err := f.service.Restore(f.ctx, result.Results[1].TrashID); err != nil {
		t.Fatal(err)
	}
	f.ds.repo.failPurge = true
	result, err = f.service.Manage(f.ctx, []string{"song"}, "permanent")
	if err != nil || result.Completed != 0 || result.Results[0].Status != "pending" || result.Results[0].TrashID == "" {
		t.Fatalf("pending intent lost: %+v %v", result, err)
	}
	f.ds.repo.failPurge = false
	if err := f.service.Recover(f.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(f.data, "song-trash", result.Results[0].TrashID, "audio")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("pending purge not recovered: %v", err)
	}
}

func TestSongManagementValidatesEntireSelectionBeforeMutation(t *testing.T) {
	f := newSongTrashFixture(t)
	for _, ids := range [][]string{nil, {"song", "song"}, {"song", ""}} {
		if _, err := f.service.Manage(f.ctx, ids, "permanent"); !errors.Is(err, ErrSongManagementSelection) {
			t.Fatalf("invalid selection accepted: %v", err)
		}
	}
	if _, err := f.service.Manage(request.WithUser(t.Context(), model.User{ID: "regular"}), []string{"song"}, "trash"); !errors.Is(err, ErrTrashForbidden) {
		t.Fatalf("regular user permitted: %v", err)
	}
	assertSongTrashContent(t, filepath.Join(f.music, f.path), f.content)
}
