# Statement import

A React Native (Expo development build) fragment that does the following:
- picks a synthetic bank statement and checks it on the device;
- uploads the raw bytes to the local mock from `mobile-engineer-kit/`;
- follows the job until it is ready;
- recovers from a lost response or a relaunch;
- deletes the import.

The kit is included unchanged.

## Requirements

- macOS, Node.js 20+ (tested with 24.15.0, npm 11.12.1)
- iOS: Xcode 26.6, CocoaPods 1.17.0, an iOS 26.5 simulator
- Android: JDK 17 (tested with OpenJDK 17.0.21), Android SDK with platform 37, build-tools 37.0.0, NDK 27.1.12297006, and an emulator image (tested with `system-images;android-36;google_apis;arm64-v8a`)

```sh
export JAVA_HOME=<path to JDK 17>
export ANDROID_HOME=$HOME/Library/Android/sdk
```

## Clean checkout

```sh
git clone <repo-url> statement-import
cd statement-import
npm ci
npm run fixtures:oversize      # creates mobile-engineer-kit/fixtures/oversize.csv (10 MiB + 11 bytes)
```

## Run

Terminal 1, the mock (`http://127.0.0.1:8787`):

```sh
npm run mock
```

Terminal 2, the app. It is an Expo development build, not Expo Go or web. `ios/` and `android/` are generated on the first run (Expo prebuild); they are not committed.

```sh
npm run ios -- --device "iPhone 17"          # iOS simulator

adb reverse tcp:8787 tcp:8787                 # Android emulator: forward the mock port
npm run android
```

Then copy the fixtures onto the booted simulator and the emulator:

```sh
./scripts/push-fixtures.sh
```

- **iOS:** they appear in the picker under Browse > On My iPhone.
- **Android:** they appear under Downloads / Recent.

A physical device would need `EXPO_PUBLIC_API_URL=http://<LAN IP>:8787` and the mock started with `HOST=0.0.0.0`. This was not tested.

## Tests

```sh
npm test            # Vitest: unit tests + scenario tests against the kit's mock server
npm run mock:test   # the kit's own tests
npm run typecheck
```

The scenario tests import `createMockServer` from `mobile-engineer-kit/mock-server.mjs` without changes. Each test starts the mock on a random port with a fresh state file, so counters always start from zero and runs are reproducible. Saved output: [TEST_RESULTS.md](TEST_RESULTS.md).

| Matrix row | Test (`tests/import-flow.test.ts`) | What it asserts |
|---|---|---|
| happy | `uploads the real bytes and shows the server result only once ready`, `accepts the PDF fixture` | `queued` comes before `ready`. `acceptedBytes` equals the fixture size. Data comes from the server. No local copy is left. |
| saved key | `persists the idempotency key before the first POST` | The key is already in storage when the upload starts, and the same key is sent. |
| lost_ack | `recovers the job by key without creating a second one` | `newJobs == 1`, `createRequests == 1`. |
| lost_ack + relaunch | `finds the job after a relaunch and does not resend the file` | A new controller on the same storage finds the job by key. It makes 0 uploads and `createRequests` is unchanged. |
| uncertain, never arrived | `offers a retry with the same key when the upload never arrived` | After a relaunch there is no automatic POST. The retry uses the stored key. `newJobs == 1`. |
| stale_status | `keeps showing ready when an older processing revision arrives` | The UI state stays `ready` with revision 3, and `stale_ignored` is logged. |
| delete_failure | `does not claim deletion after a 503 and finishes with the same key` | After the 503, the job is still ready and the UI shows deletion as not confirmed, including after a relaunch. The retry uses the same delete key. `deleted` appears only after the server reports it. `deleteRequests == 2`. |
| late response | `ignores a late status that arrives after deletion started` | A `ready` response that arrives while deletion is in progress doesn't roll the state back. |
| lost DELETE response | `checks the job again when the DELETE response is lost` | After a DELETE without a reply the app asks the server for the job instead of guessing, and reaches `deleted` with one DELETE. |
| double tap on delete | `sends one DELETE when delete is tapped twice` | Two overlapping delete calls produce one DELETE. |
| storage failure | `does not POST when the key cannot be saved`, `does not send DELETE when the delete key cannot be saved` | No request goes out unless its key was saved first; the screen shows an error instead of hanging. |
| spoofed + oversize | `rejects both files before any POST` | `/__test/state` stats are identical before and after. |

## Switching scenarios

Dev builds show a **Mock diagnostics** panel at the bottom of the screen. It has scenario buttons, live counters from `/__test/state`, and Reset. It also lists the app's last five log events (event name, status, revision, reason), so an ignored stale response is visible on screen as `stale_ignored · processing · r2`. The same can be done from a terminal:

```sh
curl -X POST localhost:8787/__test/scenario -H 'Content-Type: application/json' -d '{"mode":"lost_ack"}'
curl localhost:8787/__test/state
curl -X POST localhost:8787/__test/reset
```

## Results

Verified on 2026-10-31 from a clean copy of the repository (only the files that are committed): `npm ci`, the tests, native builds with `npm run ios` and `npm run android`, then every row below on both devices. After the last code change (JS only) the matrix was run again on both devices on 2026-11-02. Dev builds, Expo SDK 58.0.21, React Native 0.88.1.

| Check | iOS: iPhone 17 simulator, iOS 26.5 | Android: Pixel 7 emulator, Android 16 (API 36) |
|---|---|---|
| Native build and launch | pass | pass |
| System picker | pass (Files, On My iPhone) | pass (DocumentsUI, Downloads) |
| spoofed.pdf, oversize.csv rejected before POST | pass, `createRequests` stayed 0 | pass, `createRequests` stayed 0 |
| happy | pass: statement.pdf, mock SHA-256 equals the fixture | pass: statement.csv, `acceptedBytes` 112 |
| lost_ack | pass: recovered by key, 1 new job | pass: recovered by key, 1 new job |
| lost_ack, then relaunch | pass: job shown, `createRequests` unchanged | pass: job shown, `createRequests` unchanged |
| stale_status | pass: stays Ready, `stale_ignored` | pass: stays Ready, `stale_ignored` |
| delete_failure, relaunch, retry in happy | pass: "not confirmed", same key, `deleted` rev 5 | pass: "not confirmed", same key, `deleted` rev 5 |
| Slow upload: 1 MB CSV through a local proxy limited to 24 KB/s | pass: Ready after 45 s, 1 new job | pass: Ready after 47 s, 1 new job |
| No file copies left after the flow | pass (checked the app container) | pass (checked with `run-as`) |
| Small screen, largest font | pass: iPhone SE (3rd gen), AX5 text size. Long words (file and merchant names) wrap mid-word. The system file picker was opened at the default size, because at AX5 its search bar covers the file icons. | pass: font scale 2.0 at 360x640 dp |

**Release builds** were checked on the same devices on 2026-11-02 (`npm run ios -- --configuration Release`, `npm run android -- --variant release`). They have no diagnostics panel, so scenarios were switched with curl.
- iOS: pass for the picker, both rejections, happy (mock SHA-256 equals the fixture), lost_ack with relaunch, stale_status (stays Ready), and delete_failure with relaunch and retry (`deleteRequests` 2, job `deleted`). No file copies left. The small-screen check was not repeated.
- Android: the release build blocks plain HTTP (no `usesCleartextTraffic`), so it can't reach the mock. The app shows "Can't reach the server", `createRequests` stays 0, and Discard goes back to the start. The Android rows above were run on the dev build.

**Not tested:**
- physical devices
- the Android release build end to end (it needs an HTTPS API)
- iOS versions other than 26.5
- Android versions other than 16

Not covered on devices: killing the app *between* a lost upload response and the by-key lookup. The automated tests cover that case, but on a device the lookup runs within milliseconds, so it can't be timed by hand. On devices, the relaunch was checked after recovery.

The UI is in English; the «Подробнее» button from the brief is labelled **Details**.

## Video

[videos/ios.mp4](videos/ios.mp4) (2:03) and [videos/android.mp4](videos/android.mp4) (3:41), both dated 2026-10-31, on the devices above. Each video is five parts, with a caption bar naming the current part. Taps were scripted with agent-device and show as touch dots. The open diagnostics panel shows the mock counters and the app's events.

| Part | iOS | Android | What to look for |
|---|---|---|---|
| 1. spoofed + oversize | 0:00 | 0:00 | Both files rejected on the device. `createRequests` stays 0. |
| 2. happy | 0:15 | 0:22 | Confirm screen, then queued, processing and ready. The Details card has no cancel action. "Deleted" appears only after the server reports it. |
| 3. lost_ack, then relaunch | 0:43 | 1:01 | `upload_unknown`, then `job_recovered`. After the relaunch the job is still there and `createRequests`/`newJobs` stay at 1. |
| 4. stale_status | 1:06 | 1:52 | A pull-to-refresh after ready gets `processing` r2. It is logged as `stale_ignored` and the screen stays Ready. |
| 5. delete_failure | 1:24 | 2:24 | The 503 shows "Deletion wasn't confirmed", also after a relaunch. After switching to happy, "Try deleting again" reaches deleted. `deleteRequests` is 2. |

## Layout

```
src/core/       platform-free logic: validation, revision rule, API client, ImportController
src/platform/   Expo adapters: picker, file access, HTTP upload, AsyncStorage
src/ui/         the import screen, job card and charge details
src/ui/components/   shared UI pieces: Button, Card, Field, Notice, Progress
src/ui/dev/     the diagnostics panel, dev builds only
tests/          Vitest suites; tests/support.ts runs the kit mock in-process
videos/         screen recordings of the matrix on iOS and Android
mobile-engineer-kit/   the candidate kit, unchanged
```

See [RELEASE_NOTES.md](RELEASE_NOTES.md) for permissions, file copies and the OTA boundary, and [SELF_REVIEW.md](SELF_REVIEW.md) for the self-review.
# rnproject
