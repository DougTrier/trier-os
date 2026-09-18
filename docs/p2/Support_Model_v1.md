> Historical phase specification/review. Proposed behavior, acceptance boxes and version samples below are design history, not a current implementation guarantee or new feature roadmap. Current prepared 3.7.2 implementation and the established remediation evidence win; see [architecture](../ARCHITECTURE.md), [validation limits](../SECURITY_MAINTENANCE_VALIDATION.md) and [maintenance policy](../MAINTENANCE.md).

# Trier OS — Operational Support Model v1
> Required before any pilot deployment. Every failure must have a documented response.

---

## Tiered Support Model

| Tier | Who | Scope | Response time |
|---|---|---|---|
| **Tier 0** | On-site operators and maintenance leads | Self-service recovery using runbooks and in-app docs | Immediate |
| **Tier 1** | Local IT/OT team | Server restarts, config issues, connectivity problems, DB backups | < 30 min (Sev 1) |
| **Tier 2** | Trier OS engineering (Doug Trier) | Application bugs, data corruption, schema issues, security incidents | < 2 hours (Sev 1) |

**Escalation path:** Tier 0 → Tier 1 → Tier 2. Skip tiers only for Sev 1 plant-impact events.

---

## Severity Levels

| Severity | Definition | Examples | Target response |
|---|---|---|---|
| **Sev 1** | Plant production impact or safety concern | Trier OS completely down, LOTO permits inaccessible, scan system failing | < 30 min |
| **Sev 2** | System degraded — significant function unavailable | Reports not running, sync failing, single module down | < 2 hours |
| **Sev 3** | Non-critical issue — workaround available | UI bug, slow query, non-blocking error in logs | Next business day |

---

## Escalation Contacts

*(Fill in before pilot goes live)*

| Role | Name | Contact |
|---|---|---|
| Trier OS Engineering | Doug Trier | [fill in] |
| Site IT Lead | [fill in] | [fill in] |
| Plant Maintenance Lead | [fill in] | [fill in] |
| On-call (pilot period) | Rotating | [define roster] |

---

## Pilot Active Period Protocol

During the active pilot window:
- Daily check-in call: confirm system health via `GET /api/health`, review any overnight flags
- Trier OS engineering on standby — response targets must be agreed locally; no staffed maintainer SLA is established by this historical template
- Any Sev 1 event: contact Doug Trier directly before attempting site recovery
- Log every issue encountered — even minor ones. Pilot feedback is highest-value input.

---

## Known Safe Recovery Actions (Tier 0 / Tier 1)

These actions are safe for on-site teams without Tier 2 involvement:

| Symptom | Safe recovery action |
|---|---|
| App shows blank/error screen | Refresh browser. If persists, check server is running. |
| Scan not responding | Check network connectivity. Verify server is up via `/api/ping`. |
| "Working Offline" banner stuck | Check Wi-Fi. Banner clears automatically when connectivity restores. |
| Wrong plant data showing | Verify `x-plant-id` in browser localStorage matches plant. |
| Server process not running | See `Incident_Runbooks/system_outage.md` |

---

## What Requires Tier 2 (Do Not Attempt Without Engineering)

- Any SQLite database file manipulation
- Direct schema changes
- JWT secret rotation
- Security incidents or suspected data breach
- Any change to `.env` configuration file
- Rollback to a previous version
