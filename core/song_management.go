package core

import (
	"context"
	"errors"
	"strings"

	"github.com/navidrome/navidrome/log"
)

const MaxSongManagementBatch = 250

var ErrSongManagementSelection = errors.New("select between 1 and 250 songs and a valid deletion mode")

type SongManagementItem struct {
	ID      string `json:"id"`
	TrashID string `json:"trashId,omitempty"`
	Status  string `json:"status"`
	Error   string `json:"error,omitempty"`
}

type SongManagementResult struct {
	Results   []SongManagementItem `json:"results"`
	Completed int                  `json:"completed"`
	Failed    int                  `json:"failed"`
}

// Manage uses the same recoverable transition even for direct permanent deletion.
// A confirmed purge may remain pending after an I/O error; recovery will finish
// its durable intent. Callers must refresh actual state instead of retrying IDs
// as though the whole batch were an atomic transaction.
func (s *SongTrash) Manage(ctx context.Context, ids []string, mode string) (*SongManagementResult, error) {
	if _, err := trashAdmin(ctx); err != nil {
		return nil, err
	}
	if len(ids) == 0 || len(ids) > MaxSongManagementBatch || (mode != "trash" && mode != "permanent") {
		return nil, ErrSongManagementSelection
	}
	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		if strings.TrimSpace(id) == "" || len(id) > 512 || seen[id] {
			return nil, ErrSongManagementSelection
		}
		seen[id] = true
	}
	result := &SongManagementResult{Results: make([]SongManagementItem, 0, len(ids))}
	for _, id := range ids {
		item := SongManagementItem{ID: id, Status: "failed"}
		if ctx.Err() != nil {
			item.Error = "The request stopped before this song was processed."
		} else if entry, err := s.Delete(ctx, id); err != nil {
			log.Warn(ctx, "Batch song move did not finish", "songID", id, err)
			item.Error = "This song could not be moved. Refresh the library and trash to check its state."
		} else {
			item.TrashID = entry.ID
			item.Status = "trashed"
			if mode == "permanent" {
				if _, err := s.Purge(ctx, entry.ID); err != nil {
					log.Warn(ctx, "Batch permanent song deletion did not finish", "songID", id, "trashID", entry.ID, err)
					item.Status = "pending"
					item.Error = "Permanent deletion did not finish. Refresh the trash; an interrupted deletion may finish during recovery if its permanent-delete intent was recorded."
				} else {
					item.Status = "deleted"
				}
			}
		}
		if item.Status == "trashed" || item.Status == "deleted" {
			result.Completed++
		} else {
			result.Failed++
		}
		result.Results = append(result.Results, item)
	}
	return result, nil
}
