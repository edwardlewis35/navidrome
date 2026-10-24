# Administrator music management

These endpoints extend the native `/api` interface. Existing Subsonic / OpenSubsonic endpoints, authentication, streaming, transcoding and client playback contracts are unchanged.

All new routes require an authenticated administrator. The normal API authenticator returns `401` without valid authentication; regular accounts receive `403` before a body or file is processed. Administrators can manage any configured local library. Remote storage cannot receive uploads.

## Batch song operations

`POST /api/song/batch`

```json
{"ids":["media-file-id-1","media-file-id-2"],"mode":"trash","confirm":true}
```

- `mode` is `trash` or `permanent`.
- Explicit Boolean `confirm: true` is required for either mode.
- Select 1–250 unique media-file IDs. Playlist row IDs must first be resolved to their `mediaFileId`; a playlist position is not a song ID.
- Unknown fields, malformed or trailing JSON, invalid modes and invalid selections return `400` before any song is changed.
- The selection is frozen when the UI confirmation opens.
- Files in a shared music directory affect other services reading that directory.

A completed request returns `200` with independent results, including partial failures:

```json
{
  "completed": 1,
  "failed": 1,
  "results": [
    {"id":"media-file-id-1","trashId":"trash-uuid","status":"trashed"},
    {"id":"media-file-id-2","status":"failed","error":"This song could not be moved. Refresh the library and trash to check its state."}
  ]
}
```

Statuses are `trashed`, `deleted`, `failed`, and `pending`. `completed` includes fully finished `trashed` or `deleted` results. `failed` includes unsuccessful or unfinished results. A successful move retains the trash UUID for recovery.

Direct permanent deletion first uses the existing durable move-to-trash transition, then the existing durable purge transition. A failure during purge returns `pending` with the trash UUID. An interrupted, confirmed irreversible intent may finish during startup, scanning, or a later trash recovery check. `pending` does not promise that a file can still be restored. Refresh the actual library and trash after every partial response or transport failure; do not assume batch rollback.

## Upload audio

`POST /api/library/{numericLibraryId}/upload?folder=Artist%2FAlbum`

Use multipart form data with one file part named `file`. Omit `folder` to upload into the selected library root. A supplied folder must already exist inside that library; the upload does not create arbitrary directories.

The browser sends up to 25 files sequentially. Each API request accepts one file up to 512 MiB. Files must have a supported audio extension and matching initial file signature: MP3, FLAC, Ogg/Opus, WAV, AIFF, M4A/M4B/MP4/ALAC, AAC, APE, WavPack, DSF, DFF, or WMA. The existing scanner performs actual metadata extraction; a file signature is not a full codec integrity check.

The upload rejects unsafe filenames, traversal, symlink destinations, hidden folders/files, nonlocal libraries, and existing destinations. It streams through a unique staging file in a confined directory handle, flushes it, and publishes it atomically with a hard link. Publication never replaces an existing file. Interrupted or rejected requests clean up their unpublished staging file.

A successful publication returns `201`:

```json
{"libraryId":1,"path":"Artist/Album/song.flac","size":123456,"saved":true,"scanComplete":true}
```

The service waits for an existing scan and requests a quick selective scan through the existing scanner service, with a two-minute scan deadline. Scan errors do not undo or misreport a saved file:

```json
{"libraryId":1,"path":"song.flac","size":123456,"saved":true,"scanComplete":false,"scanError":"File saved. Library refresh did not finish; use Refresh library to retry without uploading the file again."}
```

The page removes saved files from the pending upload selection so they are not silently uploaded twice. Scan warnings, when present, are returned in `warnings`.

- `400`: invalid multipart, unsafe filename/folder or unsupported audio signature.
- `403`: nonadministrator or unwritable destination.
- `404`: unknown library or absent destination folder.
- `409`: destination occupied; existing bytes were not overwritten.
- `413`: file exceeds 512 MiB.

## Retry database refresh

`POST /api/library/{numericLibraryId}/upload/scan?folder=Artist%2FAlbum`

This administrator-only endpoint requests the same quick selective scan without uploading again. It returns `200` with `{"scanComplete":true,"warnings":[]}` when the scan completes. The web page also refreshes cached library data after uploads and management operations.
