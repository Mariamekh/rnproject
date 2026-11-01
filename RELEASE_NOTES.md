# Release note: statement import

## Permissions

**iOS: none.** The file comes through the system document picker (`UIDocumentPickerViewController`, import mode), which hands the app a copy of the one file the user chose. ATS allows plain HTTP only to local addresses (`NSAllowsLocalNetworking`). `NSLocalNetworkUsageDescription` in the dev build comes from the Expo dev launcher, not from this feature.

**Android: `INTERNET` only.** The picker is `ACTION_OPEN_DOCUMENT`. It gives a temporary read grant for the chosen `content://` URI, so no storage permission is needed and the grant is not persisted. The Expo template's default `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW` and `VIBRATE` are removed with `blockedPermissions`.

The merged release manifest was checked with `./gradlew :app:processReleaseMainManifest`. It contains `INTERNET`, AndroidX's app-internal `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, and `allowBackup=false`, with no cleartext traffic. Debug builds additionally get `SYSTEM_ALERT_WINDOW`, `ACCESS_NETWORK_STATE`, `ACCESS_LOCAL_NETWORK` and `CHANGE_WIFI_MULTICAST_STATE`, plus cleartext HTTP, all from the React Native and Expo dev tooling. A release build would talk HTTPS to a real API. On the emulator the release build can't reach the local HTTP mock and shows "Can't reach the server" without sending anything.

## Where copies of the file exist

| Copy | Location | Lifetime |
|---|---|---|
| iOS picker copy | `tmp/<bundle id>-Inbox/<original name>` | Made by the system before the app sees the file. Deleted right after a failed check, or moved into the import folder on confirm. Android has no equivalent: the app reads the `content://` URI in place. |
| App's private copy | `Library/Caches/imports/<random id>.<pdf\|csv>` (iOS), `cache/imports/<random id>.<pdf\|csv>` (Android) | Exists only until the server acknowledges the upload, because a retry must send the same bytes under the same key. Deleted as soon as the job id is known, and on discard or server rejection. |
| Operation record | AsyncStorage | Idempotency key, job id, status, revision, delete key, phase, and the path of the private copy while it exists. The header-safe file name is kept only until the job id is known. The result (merchants, amounts) is not stored; it is fetched again after a relaunch. |

On every launch the app deletes any file in its import folder that the saved operation doesn't reference, plus picker leftovers. That covers a crash mid-flow. Neither location is backed up: iOS excludes `Library/Caches` from iCloud backup, and Android has `allowBackup=false`.

Logs contain only event names and status, revision or reason codes, and only in dev builds (the dev diagnostics panel shows the last five). No file name, bytes, URI or merchant text is logged. There is no analytics or crash-reporting SDK.

## Clearing data

- **In the app:** Delete import, then wait until the server reports `deleted`. "Import another statement" then removes the local record.
- **On the device:** uninstall the app. On Android you can also use Settings > Apps > Statement Import > Storage > Clear storage.
- **Mock server:** `POST /__test/reset`.

**Known gap:** discarding an upload whose outcome is still unknown removes the local data only. If that upload did reach the server, the server copy stays. The app warns about this before discarding.

## Signals that should stop a rollout

- **More than one job per idempotency key, or any 409 on create.** This means the key or the bytes are not stable across retries.
- **Deletions that stay in `deleting`,** or a rising DELETE 5xx rate.
- **A rising share of uploads stuck in `uncertain`,** for example by-key lookups that keep returning 404.
- **Startup cleanup regularly finding leftover files.** This means the cleanup isn't working.
- **Crashes in the picker or file-handling path.**
- **Any log or crash payload containing a file name or statement content.** Stop immediately.

## OTA update vs new binary

**Can ship as a JS bundle (OTA):**
- validation rules
- retry, backoff and timeouts
- revision handling
- texts and layout
- request paths on the same host
- log fields

**Needs a new native binary:**
- adding or upgrading native modules, or the Expo/React Native SDK (`expo-file-system`, `expo-document-picker`, AsyncStorage, safe-area)
- any manifest or Info.plist change: permissions, ATS or cleartext rules, network security config, `allowBackup`, local-network usage text
- changing how the picker accesses files (iOS copy vs. open-in-place, Android persistable grants), or replacing it with a custom native module
- moving uploads to a background URL session

An OTA bundle still has to read what the previous bundle persisted. The operation record carries a `version`, and a record the app can't read is dropped. For an upload that is still unresolved, that means losing its idempotency key. So a change to `ImportOp` must ship with a migration, not just a version bump.

`expo-updates` is not installed in this repo, so today every change ships as a binary. If OTA is added, the runtime version should follow the native fingerprint, so a bundle can never land on a binary it doesn't match.
