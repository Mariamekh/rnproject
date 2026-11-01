# Self-review

## Decisions

**1. The import is a small persisted operation; the core has no React Native imports.** `src/core` holds validation, the revision rule and the controller. Everything platform-specific (picker, files, HTTP, storage) is injected. Because of that, the whole acceptance matrix runs in Node against the kit's own `createMockServer`, unmodified, on a random port with a temp state file. The app runs the same controller with Expo adapters.

**2. Before the first POST the app persists two things: the idempotency key and a private copy of the file.** After an unknown outcome it only *reads*: `GET /imports/by-key/{key}`. Sending the file again is a user action, with the same key and the same bytes. After a relaunch the app never POSTs or DELETEs on its own. The delete key is created and persisted the same way before the first DELETE.

**3. One revision rule for every response.** A response is applied only if it is for the same job and has a higher revision. `deleted` is terminal. That one rule covers `stale_status`, a duplicate POST (which always answers `queued`/1), and a status that arrives late while deletion is in progress. The only exception is an equal revision that fills in the result after a relaunch, because the result itself is not persisted.

The bytes never pass through JS: validation reads 1 KiB from the head and 1 KiB from the tail of the file, and the upload streams from the private copy natively.

## What I simplified for the deadline

- One import at a time. A new import is possible only after delete or discard.
- The controller is a class whose state is spread over a few fields (persisted phase, view, deletion, offline). The next step would be a pure `reduce(state, event)` with a separate effects runner, so impossible combinations can't be represented and every transition gets its own test.
- Expo libraries instead of a custom native file module. On iOS the picker always copies the file into `tmp/<bundle id>-Inbox` before the app can check its size, so an oversize file does get copied (then deleted).
- Foreground polling with backoff. No push updates, no background upload session. Polling pauses when the app is in the background.
- UI state is tested through the controller, not with component tests. Scenarios are switched from a dev-only diagnostics panel.
- No physical devices. The iOS release build passed the matrix. The Android release build blocks plain HTTP and can't reach the local mock, so Android was checked on the dev build.

## What will break first in production, and how I'd notice

- **Uploads on a bad mobile connection.** The upload timeout scales with the file (30 s plus 16 KB/s), and the native layer drops a connection after 60 s without data. Slower than that, or stalled, the outcome is unknown while the server may still be receiving the file, and by-key can return 404 at that moment. Retrying is safe thanks to the key, but it's confusing for users. Metric: the rate of `upload_unknown` events and time spent in `uncertain`.
- **Document providers that can't give a size or a file descriptor,** such as cloud-only files on Android. These end up rejected as `unreadable`. Metric: `file_rejected` with reason `unreadable`.
- **iOS clearing `Library/Caches` under storage pressure while an upload is unresolved.** The retry button disappears. Metric: `uncertain` operations without a local copy.

## AI use

I used Claude Code to read the mock server source, scaffold the Expo project, and draft code, tests and docs. I reviewed every change. I ran `npm test` and `npm run mock:test`. I went through each matrix scenario on the iOS simulator and the Android emulator, comparing the UI with `GET /__test/state`. I compared the SHA-256 the mock stored with the fixture's, and checked the app sandbox for leftover copies after each flow. The demo videos were recorded on the simulator and the emulator, with taps scripted through agent-device.
