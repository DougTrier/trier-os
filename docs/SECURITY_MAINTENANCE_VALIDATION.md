# Historical security maintenance validation (v3.7.2 candidate)

**Current release status:** [Trier OS v3.7.2 is published](https://github.com/DougTrier/trier-os/releases/tag/v3.7.2). This document retains the earlier candidate-stage evidence and validation scope. The documented code-correctable defects were subsequently fixed and regression-verified in [the surgical follow-up](SURGICAL_REMEDIATION_AUDIT.md), followed by completed artifact verification and publication. Candidate-stage approval and hold-point wording below records that earlier scope, not a pending v3.7.2 release gate.

Copyright © 2026 Doug Trier. Trier OS source remains MIT licensed; branding and trademark notices remain separate.

Public `demo_*` accounts are confined to `examples` by server authorization, including plant selectors in headers, query parameters and parsed bodies. Ordinary authorized staff retain intended cross-plant search. Shared floorplan IDs are checked after URL decoding; nested pins, annotations, zones and sensors are checked against their actual owning plan, including when an examples-parent URL is supplied.

Password verification for the creator account when TOTP is enrolled/enforced issues only a `pre2fa` challenge. Protected APIs reject that token. Only `POST /api/auth/verify-2fa` can exchange the challenge and a valid TOTP for a full session.

Floorplan uploads accept actual PNG, JPEG, GIF and WebP images. The server verifies signatures and decodes pixels. HTML, JavaScript, SVG and disguised active content are rejected. Historical active or unknown attachments remain stored and are served as downloads with `nosniff` and a sandbox policy. Raster images, media and PDFs retain inline serving. Check actual operator document viewers and floorplan display before approving a commit.

Network changes require an administrator. Adapter names must match the host's adapter inventory; address values must be valid IPv4 values. Commands use fixed executables and argument arrays without a shell. Automated tests record commands and never reconfigure the host network.

See [HA secret provisioning](HA_SECRET_PROVISIONING.md) for explicit pairing, environment precedence, peer endpoint restrictions and rotation of previously distributed credentials.

## Disposable validation prerequisites

Run against a separate application/data copy, never the production databases. Keep all fixture secrets outside tracked files and logs. Existing ghost accounts, configured Gatekeeper, an enabled Bentley integration fixture and a current-date quality record are prerequisites of existing tests. Those data/configuration prerequisites do not authorize product changes.

The security spec additionally requires:

- `TRIER_SECURITY_TEST_CREATOR_PASSWORD`: the disposable creator account's password, for real TOTP enrollment/completion/cleanup.
- `HA_SYNC_KEY`: a fresh, explicitly provisioned 64-character hex test peer secret, matching the disposable server.
- `TRIER_RETIRED_HA_KEY`: optional private input to explicitly test retirement of an old installed credential; never print it.
- `TRIER_UNSAFE_UPLOAD_PATH` and `TRIER_UNSAFE_SCRIPT_PATH`: URLs of benign historical HTML/JS fixtures placed only in the disposable upload directory. These prove existing active files cannot execute; do not populate a live installation with such fixtures.

The TOTP test temporarily enrolls the disposable creator and disables enrollment in cleanup. The existing verification replay cache can reject repeated completion attempts within 90 seconds. Allow that interval between targeted repeats; do not weaken authentication to accommodate tests.

Enumerate first with `npx playwright test --list`. For a future security change whose scope requires a complete gate, run the entire configured suite with `npx playwright test --max-failures=1 --retries=0` after targeted regressions are green. Documentation-only maintenance does not require another test run. Stop and diagnose the first failure. A selected project or a stopped run is not a complete passing suite. Retain JSON/list reports and failure artifacts outside the product tree.

Standalone checks include the existing `tests/unit/*.test.js`, new boundary regressions, and `node tests/integration/release-gate.test.js`. `lan_hub_transport.test.js` requires port 1940 free and checks real transport only; it does not prove offline queue/replay correctness. Doug's physical scanner/phone/operator validation remains a separate hold point.

## Completed security-maintenance evidence — 2026-09-17

These results describe the reviewed working tree at that intermediate stage, before publication. The remediation was tested as 3.7.1; release metadata was then prepared as 3.7.2. Subsequent completed regression and packaging verification are recorded in [the surgical follow-up](SURGICAL_REMEDIATION_AUDIT.md) and [release build record](RELEASE_BUILD_3.7.2.md).

| Validation stage | Observed result |
|---|---|
| Complete Playwright gate, before final floorplan regression | 1,137 instances; 42 specs; 7 projects; 1,113 passed; 24 skipped; 0 failed; 0 retries; 0 flaky; 0 unexecuted; 55.6 minutes |
| Current enumeration after final floorplan regression | 1,139 instances; 42 specs; enumeration is not execution |
| Final targeted security runs | 34 passed; 0 failed; 0 skipped; 0 retries |
| Related floorplan/map/XSS runs | 5 passed; 1 unchanged conditional skip; 0 failures |

The final case adds two configured-project instances. Those were validated through targeted runs after the complete gate, not another full run of all 1,139 instances. All 55 original test files were byte-for-byte unchanged, and existing assertions were not weakened. The complete gate explicitly disabled retries; that differs from the configuration's normal retry default. Skipped cases are coverage gaps, not passes.

The projects are Desktop Chrome and six Mobile Chrome batches using Playwright's Pixel 5 emulation. This is not physical Zebra/phone testing. Doug's prior hands-on scanners and phones remain a separate functional baseline. Some scanner/offline/guided-flow tests mock or intercept communication. Real authenticated LAN WebSocket transport checks do not prove queue drain, power-loss/restart recovery or paired-corporate-server failover.

### Limits recorded at the candidate stage

- Offline queue/replay authentication, reconnect defaults, per-item ACK handling and restart recovery are not fully validated (deferred OPS-01 / OPS-06).
- HA event ordering/idempotency and rollback pooled-connection lifecycle remain deferred (OPS-02 / OPS-04); paired-server recovery needs deployment-specific validation.
- The migration runner expects `.up(db)`, while migration 047 exports a function; this mismatch was not remediated (OPS-03). Review actual migration coverage rather than assuming every numbered file ran.
- A zero-database/zero-coverage invariant report can return PASS (OPS-05). Inspect coverage as well as status.
- Logout clears the cookie without revoking a copied JWT (SEC-06).
- Remaining dependency advisory inventory has not been established as application exploitation. Assess runtime reachability and deployment exposure before further narrow maintenance.

These are precise limits of current evidence, not a claim that Doug's operationally validated system is generally broken. No new features or broad subsystem rewrites follow from this document. See [maintenance policy](MAINTENANCE.md).

## Commands for future targeted validation

The npm script `test:mobile` currently selects a project name absent from the configuration. Use the actual configured names or the supported wildcard selection instead; this documentation phase does not change that script:

```bash
npx playwright test --list
npx playwright test tests/e2e/security-remediation.spec.js --project="Desktop Chrome" --retries=0 --max-failures=1
npx playwright test tests/e2e/security-remediation.spec.js --project="Mobile Chrome*" --retries=0 --max-failures=1
```

Use a running disposable instance and the prerequisites above. Do not apply fixture configuration to production. For documentation-only edits, validate links, scripts and source-backed claims without starting servers, running builds or rerunning Playwright.
