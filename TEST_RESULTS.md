# Test results

Run on 2026-11-02, macOS 26.5.2, Node v24.15.0.

```
$ npm test
 ✓ tests/revision.test.ts > shouldApply > ignores an older revision after ready 1ms
 ✓ tests/revision.test.ts > shouldApply > ignores a repeated revision 0ms
 ✓ tests/revision.test.ts > shouldApply > accepts newer revisions 0ms
 ✓ tests/revision.test.ts > shouldApply > never resurrects a deleted job 0ms
 ✓ tests/revision.test.ts > shouldApply > ignores responses for another job 0ms
 ✓ tests/revision.test.ts > shouldApply > fills in the result after a relaunch at the same revision 0ms
 ✓ tests/validate.test.ts > sniffFormat > accepts a PDF only with header and trailer 1ms
 ✓ tests/validate.test.ts > sniffFormat > accepts the statement CSV header the same way the server does 0ms
 ✓ tests/validate.test.ts > sniffFormat > rejects text that only claims to be a PDF 0ms
 ✓ tests/validate.test.ts > checkPickedFile > accepts both statement fixtures 1ms
 ✓ tests/validate.test.ts > checkPickedFile > rejects spoofed.pdf by content 0ms
 ✓ tests/validate.test.ts > checkPickedFile > rejects a file over 10 MiB without reading it 0ms
 ✓ tests/validate.test.ts > checkPickedFile > accepts exactly 10 MiB 12ms
 ✓ tests/validate.test.ts > checkPickedFile > rejects content that contradicts the extension 1ms
 ✓ tests/validate.test.ts > checkPickedFile > rejects an empty file 0ms
 ✓ tests/validate.test.ts > headerSafeName > keeps ASCII names and encodes the rest 0ms
 ✓ tests/import-flow.test.ts > happy > uploads the real bytes and shows the server result only once ready 1055ms
 ✓ tests/import-flow.test.ts > happy > accepts the PDF fixture 1017ms
 ✓ tests/import-flow.test.ts > happy > persists the idempotency key before the first POST 6ms
 ✓ tests/import-flow.test.ts > lost_ack > recovers the job by key without creating a second one 1087ms
 ✓ tests/import-flow.test.ts > lost_ack > finds the job after a relaunch and does not resend the file 1076ms
 ✓ tests/import-flow.test.ts > lost_ack > offers a retry with the same key when the upload never arrived 1075ms
 ✓ tests/import-flow.test.ts > stale_status > keeps showing ready when an older processing revision arrives 1083ms
 ✓ tests/import-flow.test.ts > delete_failure > does not claim deletion after a 503 and finishes with the same key 2081ms
 ✓ tests/import-flow.test.ts > delete_failure > ignores a late status that arrives after deletion started 2061ms
 ✓ tests/import-flow.test.ts > delete_failure > checks the job again when the DELETE response is lost 2058ms
 ✓ tests/import-flow.test.ts > delete_failure > sends one DELETE when delete is tapped twice 2104ms
 ✓ tests/import-flow.test.ts > storage errors > does not POST when the key cannot be saved 5ms
 ✓ tests/import-flow.test.ts > storage errors > does not send DELETE when the delete key cannot be saved 1031ms
 ✓ tests/import-flow.test.ts > spoofed + oversize > rejects both files before any POST 21ms
 Test Files  3 passed (3)
      Tests  30 passed (30)
$ npm run mock:test
✔ same key and bytes produce one job; changed bytes conflict (21.056875ms)
✔ lost acknowledgement is recoverable by key (12.005834ms)
✔ stale status follows ready, and failed delete does not claim deletion (11.63075ms)
✔ rejects spoofed and oversized files (16.6825ms)
✔ accepts the shared PDF fixture as real bytes (1.914792ms)
✔ job metadata survives a mock process restart (1.589875ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 111.975708
```
