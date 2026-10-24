package persistence

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Masterminds/squirrel"
	"github.com/deluan/rest"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/model/criteria"
	"github.com/navidrome/navidrome/model/id"
	"github.com/navidrome/navidrome/model/request"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

var _ = Describe("Song trash persistence", func() {
	var ctx context.Context
	var repo model.MediaFileRepository
	var song model.MediaFile

	BeforeEach(func() {
		ctx = request.WithUser(GinkgoT().Context(), adminUser)
		repo = NewMediaFileRepository(GetDBXBuilder())
		song = mf(model.MediaFile{
			ID: id.NewRandom(), Title: "Trash fixture", ArtistID: artistBeatles.ID,
			Artist: artistBeatles.Name, AlbumID: albumSgtPeppers.ID,
			Album: albumSgtPeppers.Name, Size: 123, Duration: 42,
		})
		song.Path = "song-trash-fixture/" + song.ID + ".mp3"
		library, err := NewLibraryRepository(GetDBXBuilder()).Get(ctx, 1)
		Expect(err).ToNot(HaveOccurred())
		folder := model.NewFolder(*library, "song-trash-fixture-"+song.ID)
		Expect(newFolderRepository(GetDBXBuilder()).Put(ctx, folder)).To(Succeed())
		song.FolderID = folder.ID
		DeferCleanup(func() {
			_, err := GetDBXBuilder().NewQuery("DELETE FROM folder WHERE id = {:id}").Bind(map[string]any{"id": folder.ID}).Execute()
			Expect(err).ToNot(HaveOccurred())
		})
		Expect(repo.Put(ctx, &song)).To(Succeed())
		DeferCleanup(func() {
			_, err := GetDBXBuilder().NewQuery("DELETE FROM media_file WHERE id = {:id}").Bind(map[string]any{"id": song.ID}).Execute()
			Expect(err).ToNot(HaveOccurred())
		})
	})

	It("requires an administrator for both trash and restore, and reports unknown IDs", func() {
		regularCtx := request.WithUser(ctx, regularUser)
		Expect(repo.SetTrashed(context.Background(), song.ID, true)).To(MatchError(rest.ErrPermissionDenied))
		Expect(repo.SetTrashed(regularCtx, song.ID, true)).To(MatchError(rest.ErrPermissionDenied))
		Expect(repo.SetTrashed(regularCtx, song.ID, false)).To(MatchError(rest.ErrPermissionDenied))
		Expect(repo.SetTrashed(ctx, "unknown-trash-fixture", true)).To(MatchError(model.ErrNotFound))
		got, err := repo.Get(ctx, song.ID)
		Expect(err).ToNot(HaveOccurred())
		Expect(got.Trashed).To(BeFalse())
		Expect(got.Missing).To(BeFalse())
	})

	It("hides retained rows from ordinary reads, random picks, search, cursors and criteria", func() {
		Expect(repo.SetTrashed(ctx, song.ID, true)).To(Succeed())
		options := model.QueryOptions{Filters: squirrel.Eq{"media_file.id": song.ID}}
		Expect(repo.Exists(ctx, song.ID)).To(BeFalse())
		_, err := repo.Get(ctx, song.ID)
		Expect(err).To(MatchError(model.ErrNotFound))
		Expect(repo.GetAll(ctx, options)).To(BeEmpty())
		Expect(repo.GetRandom(ctx, options)).To(BeEmpty())
		Expect(repo.CountAll(ctx, options)).To(BeZero())
		Expect(repo.Search(ctx, "Trash fixture", options)).To(BeEmpty())
		Expect(collectCursor(repo.GetCursor(ctx, options))).To(BeEmpty())
		Expect(repo.FindByPaths(ctx, []string{fmt.Sprintf("1:%s", song.Path)})).To(BeEmpty())
		match, err := repo.MatchesCriteria(ctx, song.ID, criteria.Criteria{Expression: criteria.All{criteria.Contains{"title": "Trash"}}})
		Expect(err).ToNot(HaveOccurred())
		Expect(match).To(BeFalse())
		Expect(repo.GetAll(ctx, model.QueryOptions{Filters: squirrel.Eq{"media_file.trashed": true}})).To(BeEmpty())
	})

	It("keeps annotations, bookmarks and membership while playlist APIs hide the song, then restores them", func() {
		Expect(repo.SetStar(ctx, true, song.ID)).To(Succeed())
		Expect(repo.SetRating(ctx, 4, song.ID)).To(Succeed())
		Expect(repo.AddBookmark(ctx, song.ID, "remember this", 1200)).To(Succeed())
		playlistRepo := NewPlaylistRepository(GetDBXBuilder())
		playlist := model.Playlist{Name: "Trash fixture playlist", OwnerID: adminUser.ID}
		playlist.AddMediaFiles(model.MediaFiles{song})
		Expect(playlistRepo.Put(ctx, &playlist)).To(Succeed())
		DeferCleanup(func() { Expect(playlistRepo.Delete(ctx, playlist.ID)).To(Succeed()) })
		tracks := playlistRepo.Tracks(ctx, playlist.ID, false)
		originalIDs, err := tracks.GetMediaFileIDs(ctx)
		Expect(err).ToNot(HaveOccurred())
		Expect(originalIDs).To(Equal([]string{song.ID}))

		Expect(repo.SetTrashed(ctx, song.ID, true)).To(Succeed())
		Expect(tracks.GetAll(ctx)).To(BeEmpty())
		Expect(tracks.CountAll(ctx)).To(BeZero())
		Expect(tracks.GetMediaFileIDs(ctx)).To(BeEmpty())
		Expect(tracks.GetAlbumIDs(ctx)).To(BeEmpty())
		_, err = tracks.Read(ctx, "1")
		Expect(err).To(MatchError(model.ErrNotFound))
		hiddenPlaylist, err := playlistRepo.Get(ctx, playlist.ID)
		Expect(err).ToNot(HaveOccurred())
		Expect(hiddenPlaylist.SongCount).To(BeZero())
		var retained int
		Expect(GetDBXBuilder().NewQuery("SELECT count(*) FROM playlist_tracks WHERE playlist_id = {:playlist} AND media_file_id = {:song}").Bind(map[string]any{"playlist": playlist.ID, "song": song.ID}).Row(&retained)).To(Succeed())
		Expect(retained).To(Equal(1))
		bookmarks, err := repo.GetBookmarks(ctx)
		Expect(err).ToNot(HaveOccurred())
		for _, bookmark := range bookmarks {
			Expect(bookmark.Item.ID).ToNot(Equal(song.ID))
		}

		Expect(repo.SetTrashed(ctx, song.ID, false)).To(Succeed())
		restored, err := repo.Get(ctx, song.ID)
		Expect(err).ToNot(HaveOccurred())
		Expect(restored.Missing).To(BeFalse())
		Expect(restored.Trashed).To(BeFalse())
		Expect(restored.Starred).To(BeTrue())
		Expect(restored.Rating).To(Equal(4))
		Expect(restored.BookmarkPosition).To(Equal(int64(1200)))
		Expect(tracks.GetMediaFileIDs(ctx)).To(Equal(originalIDs))
		restoredPlaylist, err := playlistRepo.Get(ctx, playlist.ID)
		Expect(err).ToNot(HaveOccurred())
		Expect(restoredPlaylist.SongCount).To(Equal(1))
		Expect(restoredPlaylist.Duration).To(Equal(song.Duration))
	})

	It("protects a retained row from scanner resets, direct deletion and missing-file purges", func() {
		Expect(repo.SetTrashed(ctx, song.ID, true)).To(Succeed())
		Expect(repo.MarkMissing(ctx, false, &song)).To(Succeed())
		Expect(repo.MarkMissingByFolder(ctx, false, song.FolderID)).To(Succeed())
		Expect(repo.Delete(ctx, song.ID)).To(Succeed())
		Expect(repo.DeleteMissing(ctx, []string{song.ID})).To(Succeed())
		_, err := repo.DeleteAllMissing(ctx)
		Expect(err).ToNot(HaveOccurred())
		var row struct{ Trashed, Missing bool }
		Expect(GetDBXBuilder().NewQuery("SELECT trashed, missing FROM media_file WHERE id = {:id}").Bind(map[string]any{"id": song.ID}).One(&row)).To(Succeed())
		Expect(row.Trashed).To(BeTrue())
		Expect(row.Missing).To(BeTrue())
		Expect(repo.SetTrashed(ctx, song.ID, false)).To(Succeed())
		Expect(repo.Exists(ctx, song.ID)).To(BeTrue())
	})

	It("does not let a scanner upsert overwrite a trashed identity or revive it by path", func() {
		Expect(repo.SetTrashed(ctx, song.ID, true)).To(Succeed())
		changed := song
		changed.Title = "Replaced file"
		Expect(repo.Put(ctx, &changed)).To(MatchError(model.ErrNotFound))
		changed.ID = ""
		Expect(repo.Put(ctx, &changed)).To(Succeed())
		Expect(changed.ID).ToNot(Equal(song.ID))
		DeferCleanup(func() { Expect(repo.Delete(ctx, changed.ID)).To(Succeed()) })
		Expect(repo.SetTrashed(ctx, song.ID, false)).To(Succeed())
		restored, err := repo.Get(ctx, song.ID)
		Expect(err).ToNot(HaveOccurred())
		Expect(restored.Title).To(Equal(song.Title))
	})

	It("requires administrator authority and refuses to purge an available identity", func() {
		Expect(repo.PurgeTrashed(context.Background(), song.ID)).To(MatchError(rest.ErrPermissionDenied))
		Expect(repo.PurgeTrashed(request.WithUser(ctx, regularUser), song.ID)).To(MatchError(rest.ErrPermissionDenied))
		Expect(repo.PurgeTrashed(ctx, song.ID)).To(MatchError(model.ErrNotTrashed))
		Expect(repo.Exists(ctx, song.ID)).To(BeTrue())
	})

	It("permanently removes only the trashed identity and all song references, preserving playlist order", func() {
		Expect(repo.SetStar(ctx, true, song.ID)).To(Succeed())
		Expect(repo.SetRating(ctx, 4, song.ID)).To(Succeed())
		Expect(repo.AddBookmark(ctx, song.ID, "purge fixture", 123)).To(Succeed())
		playlistRepo := NewPlaylistRepository(GetDBXBuilder())
		playlist := model.Playlist{Name: "Purge fixture playlist", OwnerID: adminUser.ID}
		playlist.AddMediaFiles(model.MediaFiles{song, songDayInALife, song})
		Expect(playlistRepo.Put(ctx, &playlist)).To(Succeed())
		DeferCleanup(func() { Expect(playlistRepo.Delete(ctx, playlist.ID)).To(Succeed()) })
		Expect(NewScrobbleRepository(GetDBXBuilder()).RecordScrobble(ctx, song.ID, time.Now())).To(Succeed())
		Expect(NewScrobbleBufferRepository(GetDBXBuilder()).Enqueue(ctx, "lastfm", adminUser.ID, song.ID, time.Now())).To(Succeed())
		Expect(repo.SetTrashed(ctx, song.ID, true)).To(Succeed())
		store := newSQLStore(GetDBXBuilder())
		purge := func() error {
			return store.WithTxImmediate(func(tx model.DataStore) error { return tx.MediaFile().PurgeTrashed(ctx, song.ID) })
		}
		Expect(purge()).To(Succeed())
		Expect(purge()).To(Succeed(), "journal retry must accept an already removed identity")
		for table, column := range map[string]string{"media_file": "id", "annotation": "item_id", "bookmark": "item_id", "playlist_tracks": "media_file_id", "scrobbles": "media_file_id", "scrobble_buffer": "media_file_id", "media_file_tags": "media_file_id"} {
			var count int
			Expect(GetDBXBuilder().NewQuery(fmt.Sprintf("SELECT count(*) FROM %s WHERE %s = {:id}", table, column)).Bind(map[string]any{"id": song.ID}).Row(&count)).To(Succeed())
			Expect(count).To(BeZero(), table)
		}
		tracks, err := playlistRepo.Tracks(ctx, playlist.ID, false).GetAll(ctx)
		Expect(err).ToNot(HaveOccurred())
		Expect(tracks).To(HaveLen(1))
		Expect(tracks[0].MediaFileID).To(Equal(songDayInALife.ID))
		Expect(tracks[0].ID).To(Equal("1"))
		got, err := playlistRepo.Get(ctx, playlist.ID)
		Expect(err).ToNot(HaveOccurred())
		Expect(got.SongCount).To(Equal(1))
	})

	It("rolls back the retained identity and annotations if the purge transaction fails", func() {
		Expect(repo.SetStar(ctx, true, song.ID)).To(Succeed())
		Expect(repo.SetTrashed(ctx, song.ID, true)).To(Succeed())
		injected := errors.New("injected failure after DB purge")
		Expect(newSQLStore(GetDBXBuilder()).WithTxImmediate(func(tx model.DataStore) error {
			if err := tx.MediaFile().PurgeTrashed(ctx, song.ID); err != nil {
				return err
			}
			return injected
		})).To(MatchError(injected))
		Expect(repo.SetTrashed(ctx, song.ID, false)).To(Succeed())
		got, err := repo.Get(ctx, song.ID)
		Expect(err).ToNot(HaveOccurred())
		Expect(got.Starred).To(BeTrue())
	})
})
