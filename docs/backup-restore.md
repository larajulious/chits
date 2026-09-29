# Chits Backup & Restore

Audited against the installed Expo SDK 57 APIs and the versioned [SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/), [filesystem](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/), [document picker](https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/) and [sharing](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/) documentation. Native ZIP operations reuse the installed react-native-zip-archive 9.5.1.

## Data inventory

The complete SQLite snapshot preserves every table, row, ID, relationship, timestamp, archived/deleted/hidden/pinned state, position, and metadata field. The currently supported schema is version 20.

| Storage | Preserved user state |
| --- | --- |
| `messages` | Chat text, types, timestamps, pinned, hidden, archived and deleted states |
| `attachments` | Original filename, MIME, size, duration, dimensions, creation time, message association and storage path |
| `boards` | Names, icons, accents, pins, archive state, last-opened state, column navigator and peek preferences |
| `board_columns` | Names, board association, positions, timestamps |
| `cards` | Titles, board/column association, positions, pins, archive and last-opened state |
| `card_messages` | Card/message associations and positions |
| `card_comments` | Text, owning card, timestamps, deletion state |
| `card_attachments` | Direct card files and all attachment metadata, timestamps and deletion state |
| `timeline_events` | Original history and metadata, including deduplication keys |
| `card_reminders` | Owning card, schedule and timestamps; old device notification IDs are cleared in the snapshot and reconciled after reload |
| `app_settings` | NoteSpace name, appearance, color theme, chat draft, custom chat background and its dim/blur controls, last backup date, and any other stored preferences |
| Referenced Documents files | Actual images, videos, audio, PDFs, documents and arbitrary file attachments, plus a device-selected chat background that has no attachment row |

There is no Zustand/AsyncStorage/SecureStore user persistence in this checkout. Providers and screen state are React state loaded from SQLite. Media producers already copy picker/recording sources into `chits-attachments/`; renderers resolve relative paths against the current Documents directory. No stored thumbnail files were found: previews use the original attachment. Unreferenced files, caches, native notification IDs, photo-library asset identifiers, logs, development/build files and recovery snapshots are excluded from portable backups. Historical timeline references may intentionally point to deleted items; they are preserved as history rather than treated as foreign-key errors.

## Existing defects addressed

- Old archives copied a directory indiscriminately and had no reference inventory or missing-file report.
- Validation merely opened SQLite and ran `SELECT 1`; corrupted/missing schemas, broken relationships, missing files and misleading metadata could be accepted.
- Restore could be interrupted between its database and attachment swaps, without durable startup recovery.
- Restore deleted WAL companions without first making an independent safety database snapshot.
- SDK 57's Suspense SQLite provider caches its database promise globally. Remounting it with the same props can reuse a closed connection. The native provider now waits for recovery before opening SQLite and uses the regular provider with a new connection on each mount.
- Android backup saving chose Downloads automatically. Both platforms now reuse Chits' native Files/Documents export mechanism so the user chooses the provider and location.
- Backup controls shared the Settings modal, making restore confirmation another native presentation. They now live on `/backup`, using one confirmation dialog and inline results.

## Portable format

`Chits-Backup-YYYY-MM-DD-HHmm.chitsbackup` is a ZIP containing:

```text
manifest.json
database.sqlite
attachments/chits-attachments/<original relative folders and filenames>
```

Manifest version **2** distinguishes this verified package from existing version-1 `metadata.json` archives. It records creation date, app/schema versions, chat/board/column/card/attachment counts, database size/SHA-256, each referenced physical file's relative storage/archive path, size/SHA-256, and missing references keyed by attachment table and ID. Shared references copy a physical file once. All original attachment metadata stays in SQLite.

Missing files preserve their database records. A backup reports them explicitly; restore confirmation warns that the file cannot recover them. Unlisted, omitted, duplicated, contradictory or checksum-mismatched references in a modern package are rejected. An existing valid v1 ZIP, including its optional outer folder, is supported: it is migrated in a private working database and its available files are inventoried. Older formats cannot prove historical file completeness, so missing files found in them are shown before confirmation.

SHA-256 is a corruption check, not encryption or authenticated provenance. Hashing reads 64 KB native chunks. Copying, ZIP creation/extraction and file export operate natively; media does not pass through JS as strings/base64. ZIP uses storage mode because most attachments are already compressed. The verified export stays in private Documents until it is saved or the screen closes, because Android can evict cache files while its save picker is open. Abandoned exports are removed on the next app initialization. Very large backups need space for temporary files and the safety snapshot; disk shortages produce a readable error and preserve existing data.

## Restore safety

1. Copy the selected provider URI into app-controlled cache.
2. Inspect ZIP entry names, sizes, duplicates and encryption before extraction. Reject traversal, absolute paths and insufficient free space. Extract only metadata, the database and declared files.
3. Validate the manifest, original file checksums, SQLite integrity, required tables/columns, foreign keys, explicit parent relationships, board/column consistency and schema compatibility.
4. Copy SQLite into a separate prepared location. Run the existing migrations, normalize old sandbox paths, clear installation-specific IDs and repeat database/reference checks.
5. Show the backup date, counts, size, missing-file warning and replacement confirmation. Cancellation deletes only temporary working files.
6. Stage the prepared database and attachment files in persistent `.chits-restore/`, verifying every copied file. Current data remains untouched.
7. Pause/drain reminder reconciliation and queued SQLite writes. Create a WAL-aware `safety.sqlite` snapshot and copy the current attachment directory before any destructive operation.
8. Persist a pending journal using a native synchronized temporary file and atomic rename. Close the live connection, replace both live locations, reopen and validate the installed database and files.
9. Atomically mark the journal committed, clear image caches, clean temporary state and remount the whole app tree. Settings, chat background, screen lists, drawer data and notification reconciliation reload from the restored database.

Any swap/verification failure replays the independent safety snapshot. Recovery keeps its sources untouched until both original locations are back, so another interruption can retry. Startup checks this journal **before SQLite opens or migrations run**. A committed journal only cleans up; a pending journal recovers the original installation. If recovery cannot finish, the app displays a recovery error and retains the safety files instead of opening a mixed installation. An existing pending journal is never overwritten by another restore attempt.

## Automated verification

`npm test` includes production-service tests using real SQLite, file-backed archives and filesystem copies behind a native-bridge adapter:

- Empty installation backup and restore.
- All chat/card metadata, states, ordering, IDs, relationships, comments, history and preferences.
- Images, videos, audio, PDFs, generic documents, direct card files and custom backgrounds.
- Explicit missing-file reporting and restoration of every available file.
- Invalid/truncated/future packages, tampered checksums, incomplete inventories, missing columns and broken relationships.
- Failed staging, failed attachment swap, failed commit journal, repeatable interrupted recovery and protection of an existing safety snapshot.
- Legacy schema-18/version-1 restore with stale iOS sandbox URIs, upgraded by the actual migrations.
- Provider-style content URI intake and a 256 MB file restored and rehashed without JS media reads.
- Unsafe ZIP paths, duplicate entries, encrypted entries and low-storage rejection.

The adapter verifies production orchestration and on-disk results; it does not establish native file-provider behavior or media playback. Native simulator/emulator results are recorded in [backup-native-validation.json](./backup-native-validation.json).

## Native and release checks

Passed: iOS and Android native builds; iOS 27 simulator and Android emulator round trips with image/video/audio loading and native PDF rendering; actual uninstall/reinstall into a new iOS container; restore of that iOS-created archive into a fresh isolated Android installation; process-stop/relaunch recovery of a pending journal with both live locations missing. Native media fixtures included a 32 MB file. The Android production UI also passed Create Backup → system Save → Choose Backup File → confirmation → Restore complete, and selecting an invalid text file was safely rejected. The temporary runtime harness was removed after verification.

Pending verification: iOS Files export/import (On My iPhone/iPad and iCloud), Android Drive and other cloud providers, cancellation/retry across providers, attachment opening/playback on physical devices, uninstall/reinstall into a different actual container, and low-storage/OS-kill behavior on physical devices. The implementation must ship in a rebuilt native binary because the ChitsFiles module now exposes bounded hashing and atomic journal writes.
