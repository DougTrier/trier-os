# System Degraded Mode Specification
> Trier OS P2 · Implemented in `server/middleware/degradedMode.js`

---

## The Four Modes

| Mode | Trigger | Trier OS behavior | Plant impact |
|---|---|---|---|
| **NORMAL** | All systems healthy | Full read/write | None |
| **ADVISORY_ONLY** | Anomaly detected or Gatekeeper unavailable | Writes blocked — reads allowed | None |
| **ISOLATED** | Connector failure or circuit breaker trip | External connectors cut — local reads only | None |
| **OFFLINE** | Full Trier OS process crash | System down | **Zero** — plant continues via PLC/SCADA |

---

## Mode Transitions

```
NORMAL ──────────────────────────────────────────────────────► ADVISORY_ONLY
         (subsystem anomaly / manual admin toggle)

ADVISORY_ONLY ────────────────────────────────────────────────► NORMAL
               (manual admin clearance after inspection)

ADVISORY_ONLY ────────────────────────────────────────────────► ISOLATED
               (connector failure detected)

ISOLATED ─────────────────────────────────────────────────────► ADVISORY_ONLY
          (manual admin after connector restored)

ANY MODE ─────────────────────────────────────────────────────► NORMAL
          (server restart — intentional: restarts are recovery events)
```

---

## What ADVISORY_ONLY Blocks

Any `POST`, `PUT`, or `DELETE` to `/api/*` is rejected with HTTP 503:

```json
{
  "error": "System is in read-only mode",
  "mode": "ADVISORY_ONLY",
  "since": "2026-04-12T14:32:00.000Z",
  "reason": "Subsystem anomaly detected — writes suspended pending review",
  "retryAfter": "Check GET /api/health for current status"
}
```

Always allowed regardless of mode:
- All `GET` requests (reads are never blocked)
- `/api/auth/*` (login/logout must always work)
- `/api/health/*` (mode control must always be accessible)
- `/api/ping` (monitoring)

---

## How to Set Mode

**Via API (admin or creator role required):**
```
POST /api/health/mode
Authorization: Bearer <admin-token>
{ "mode": "ADVISORY_ONLY", "reason": "Investigating sensor spike on Line 3" }
```

**Valid mode values:** `NORMAL`, `ADVISORY_ONLY`, `ISOLATED`

**Response:**
```json
{
  "ok": true,
  "mode": {
    "mode": "ADVISORY_ONLY",
    "since": "2026-04-12T14:35:00.000Z",
    "reason": "Investigating sensor spike on Line 3",
    "setBy": "doug_admin",
    "writesBlocked": true
  }
}
```

---

## How to Check Current Mode

```
GET /api/health
```
No auth required. Returns full subsystem status including current mode.

---

## Automatic Mode Triggers (Future)

These triggers are not yet implemented — they define when the system should automatically downgrade:

| Event | Mode transition |
|---|---|
| Gatekeeper service unavailable | `NORMAL → ADVISORY_ONLY` |
| Message bus failure | `NORMAL → ADVISORY_ONLY` |
| Connector circuit breaker trips | `NORMAL → ISOLATED` |
| Memory > 95% heap | Log warning — no automatic mode change |

Until these are wired to automatic triggers, mode is set manually by an authorized user.

---

## Persistence

Mode is **in-process only** — it resets to `NORMAL` on server restart. This is intentional: restarts are recovery events and should not inherit a blocked state from before the crash. If a manual restart is required during an active advisory-only period, the operator re-applies the mode via API after confirming the system is stable enough to accept it.
