# Trier OS v3.4.1 — Release Notes

**Released:** April 21, 2026  
**Platform Version:** 3.4.1  
**Previous Version:** 3.4.0

---

### What's New

#### Plant LAN Peer Sync (P8)

A new **LanHub WebSocket server** embedded in each plant's local area network enables real-time state synchronization across all floor devices — Zebra scanners, tablets, and supervisor workstations — without internet connectivity.

- All devices connect to the hub at `ws://<hub-ip>:1940` using the same JWT session token from the main app.
- Asset state changes, WO updates, and scan events broadcast to every plant device in real time.
- Hub-aware Mission Control: supervisors now see a live **device presence count** showing how many devices are connected to the plant's LAN Hub.
- On reconnect after hub outage, the central server reconciles any queued scans accumulated during the gap.

#### Offline Scan Queue & Auto-Recovery (P9)

Scans captured while offline are now preserved in a persistent **IndexedDB queue** (`TrierCMMS_Offline / sync_queue`). On device reconnect:

- The queue drains automatically — no technician action required.
- Duplicate suppression prevents double-close on records already submitted to the hub.
- All recovery events are logged to the plant audit trail.

Full Playwright E2E coverage: 6 new test scenarios in `tests/e2e/offline-lan-sync.spec.js` covering offline queue, hub reconnect, token expiry, concurrent submissions, timing verification, and queue drain behavior.

#### Silent Auto-Close Engine (P1)

A new server-side **hourly cron** (`server/silent_close_engine.js`) resolves Work Segments left open by missed close-out scans:

- Closes `Active` segments exceeding `autoReviewThresholdHours` (default: 12 h; per-plant configurable via `PlantScanConfig`).
- Exempt hold reasons (waiting-for-parts, locked-out, and others) are never auto-closed.
- Auto-closed segments are flagged `needsReview = 1` with `reviewReason = 'SILENT_AUTO_CLOSE'` for supervisor confirmation.
- Deduplication guard: does not overwrite a prior more-specific review flag.

---

### Documentation Updates

- **In-app manual** (all 11 languages): new Part XXXIII — *Offline Resilience & Plant LAN Sync*, 6 subsections, 26 new i18n keys.
- **Standalone manual** (`Manuals/Trier_OS_Operational_Intelligence_Manual.md`): Part XXXIV added (Chapter 59.1–59.6).
- **CHANGELOG, ROADMAP, QUICK_FACTS, EXECUTIVE_BRIEF, WORKFLOW_COMPARISON, FEATURE_SET, OpenAPI_Spec, QA_Checklist**: all updated to v3.4.1 / April 21, 2026.
- **FEATURE_SET.md**: two new entries — Feature 77 (Plant LAN Peer Sync) and Feature 78 (Offline Scan Queue & Silent Auto-Close Engine); OpEx Self-Healing Loop renumbered to Feature 79.

---

### E2E Test Suite

| Spec File | Tests |
|---|---|
| `offline-lan-sync.spec.js` | 6 new scenarios (hub connect/reconnect, offline queue, expired token, timing, drain) |
| Total suite | **21 spec files · 600+ passing tests** |

---

### Build Artifacts

| Artifact | Size |
|---|---|
| `TrierOS-Setup-3.4.1.exe` | NSIS installer |
| `TrierOS-Setup-3.4.1.msi` | MSI installer |
| `TrierOS-Setup-3.4.1.zip` | Portable (no install required) |

---

### Upgrade Instructions

**From v3.4.0:** No schema migrations required. Drop-in replacement — restart the server after update.

```bash
git pull origin main
npm install
npm run dev:full
```

For Electron builds, download the installer from the release assets.

---

### Known Limitations (Unchanged from v3.4.0)

- First-boot corporate index build may take 30–60 seconds on large multi-site deployments.
- HTTPS uses a self-signed cert — browsers will warn on first visit (expected for LAN deployments).
- Sensor Gateway OPC-UA requires access to OT/PLC network equipment.
- Live Studio deploy pipeline requires Git to be installed on the host machine.

---

*Released under the MIT License · © 2026 Doug Trier · [Discussions & Support](https://github.com/DougTrier/trier-os/discussions)*
