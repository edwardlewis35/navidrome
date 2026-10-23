# Administrator song trash API

The native API uses Navidrome's existing UI authentication (`x-nd-authorization: Bearer <token>`). All three endpoints require a currently authenticated administrator. Hiding the controls in the UI is supplemented by administrator checks in the HTTP routes, service and database updater.

| Method | Path | Successful response |
| --- | --- | --- |
| `DELETE` | `/api/song/{songId}` | `200 {"id":"songId","trashId":"UUID"}` |
| `GET` | `/api/trash` | `200` and an array of recoverable entries; empty is `[]` |
| `POST` | `/api/trash/{trashId}/restore` | `200 {"id":"songId","trashId":"UUID"}` |

An entry contains `id` (trash UUID), `mediaFileId`, `title`, `artist`, `album`, `path` (relative to the music library), `libraryId`, `deletedAt` (UTC RFC3339) and `deletedBy` (administrator username). Entries are returned newest first. Internal absolute paths and integrity digests are omitted from the API.

Unauthenticated requests receive `401`; authenticated regular users receive `403`. Unsafe or nonlocal paths receive `400`, missing files or entries `404`, and occupied restore paths or changed libraries `409`. Other filesystem/database failures receive `500`, except filesystem permission failures (`403`). Handler errors use an `error` JSON field; authentication and administrator middleware use Navidrome's existing responses.

## Files, recovery and retained data

The server moves the music file into its own `DataFolder/song-trash/<UUID>/audio`, with a private durable `entry.json` journal. `DataFolder/song-trash` must be outside every local music library so scans cannot import recovery copies. The service needs write access to the music directory and data directory. Local filesystem paths and local `file://` libraries are supported; remote storage and symbolic-link files or subdirectories are rejected.

Copies are streamed, SHA-256 checked, flushed to disk, and published without overwriting another file before the original is removed. Parent directories are flushed as well. This supports music and data directories on different Docker bind mounts. Destination filesystems must support hard links within a directory; unsupported filesystems fail while retaining the original/recovery copy. A journal is persisted before removal. Synchronous startup recovery runs before server/watcher/scanner startup, and every scanner subprocess reconciles pending transitions before scanning or purging missing tracks. OS file locks serialize journal transitions across server and scanner processes. Unresolved recovery blocks startup/scanning so cleanup cannot destroy retained identities. A failure to restore or resolve a changed/occupied original path leaves the recovery file available for manual investigation rather than overwriting it.

On Linux, directory flush failures are propagated. Windows can reject flushing directory handles; only its specific unsupported/denied directory-handle errors are tolerated after confirming the handle is a directory. File payload and journal flushes remain mandatory. Windows therefore has a narrower power-loss durability guarantee for directory metadata; the deployed Docker service uses the Linux behavior.

The media row is retained under the same ID and marked `trashed` and `missing`. Normal song lists, search, streams and playlists cannot retrieve it. Its annotations, bookmarks and static playlist membership remain in the database. Missing-file purges and scanner move matching exclude trashed rows. Restoring returns the file to its original relative path and clears both flags. The original library and directory must still exist. Playlist counters are refreshed with the flags; album/artist/library totals and generated artwork can require a subsequent library scan. Smart playlists are generated dynamically, so their membership follows their configured rules after restoration.

When two services share a music directory, moving a file removes access for **both services** until it is restored. The other service may mark the file missing after its next scan; its independent metadata and purge policy are outside this service's recovery transaction. Back up both services' data directories and the new service's entire `song-trash` directory together.

There is no permanent-delete/purge endpoint, and no automatic trash expiry. Retain the recovery directory when replacing containers. Completed restore journals are retained for transition history; their audio payload is removed only after the restored file and database update have succeeded. This API does not move sidecar files, album artwork, lyrics or cue-sheet companions. A user can restore a song as long as its recovery file, journal and original library identity are preserved.

## Validation boundary

Automated tests use independent temporary fixtures and synthetic bytes. They never move or delete production music. Tests cover authenticated HTTP routes, regular-user permission bypass attempts, source/path/symlink validation, cross-directory copying, digest validation, restore conflicts, database/commit rollback and interruption recovery. A real deployment should be verified with a dedicated fixture library before enabling writes to a shared music mount.
