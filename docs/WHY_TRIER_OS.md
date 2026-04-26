# Why Trier OS — Honest Comparison

This document compares Trier OS to established platforms in the maintenance and operations
space. It is written for technical evaluators, plant managers, and IT decision-makers who
need a clear-eyed assessment — not a marketing sheet.

The framing is intentionally honest: where competitors are stronger, this document says so.

---

## What Trier OS Is (and Isn't)

Trier OS is an **operational execution system**. It enforces correct process on the plant
floor, tracks every action, and emits verified data that downstream systems (including ERP)
can consume.

It is **not**:
- An ERP system
- A financial general ledger
- A procurement platform
- An accounting module

The boundary is deliberate. ERP systems record what happened. Trier OS ensures what happened
is correct before ERP ever sees it.

---

## Head-to-Head: Core Execution Model

| Capability | SAP PM | IBM Maximo | MaintainX | Trier OS |
|---|---|---|---|---|
| Scan a machine and act | Navigate to record | Navigate to record | Navigate to record | **One tap — zero keystrokes** |
| Works without internet | No | No (limited) | No | **Yes — fully offline** |
| Duplicate scan protection | No | No | No | **Yes — DB-layer idempotency** |
| Missed close-out handling | Ghost records | Ghost records | Ghost records | **Auto-flagged for review** |
| Scan dedup window | None | None | None | **Configurable per deployment** |
| Per-plant local DB | No (central) | No (central) | No (cloud) | **Yes — one SQLite per plant** |
| Zero-keystroke floor execution | No | No | Partial | **Yes — by design** |

---

## Offline Capability

Most enterprise systems treat offline as a feature to be added later. Trier OS was designed
offline-first from the start.

| Scenario | SAP PM | IBM Maximo | MaintainX | Trier OS |
|---|---|---|---|---|
| Server unreachable | Stop working | Stop working | Stop working | **Queue locally, sync on reconnect** |
| Network drops mid-scan | Lost | Lost | Lost | **Captured in IndexedDB** |
| Plant LAN without WAN | Unsupported | Unsupported | Unsupported | **LAN hub serves all devices** |
| Offline duration | N/A | N/A | N/A | **Indefinite — no data loss** |
| Multi-device sync offline | N/A | N/A | N/A | **WebSocket hub, real-time** |
| Reconnect behavior | Manual | Manual | Partial | **Auto-drain, ordered replay** |

---

## Integration Architecture

This is where the architectural difference matters most.

**Traditional approach (SAP PM, Maximo):**
```
ERP ←→ CMMS (synchronous, tightly coupled)
       ↑ ERP down = CMMS breaks
       ↑ Schema change = integration breaks
       ↑ Retry logic = your problem
```

**Trier OS approach:**
```
Plant floor → Trier OS (source of operational truth)
                   ↓
              ERPOutbox (idempotent queue)
                   ↓
              Any ERP endpoint (SAP OData, Oracle REST, Dynamics 365, custom)
                   ↑ ERP down = events queue safely
                   ↑ Schema change = update field mapping, not integration code
                   ↑ Retry with back-off built in
```

| Integration aspect | SAP PM | IBM Maximo | MaintainX | Trier OS |
|---|---|---|---|---|
| Integration model | Bidirectional sync | Bidirectional sync | Webhook | **Outbound event stream** |
| Survives ERP downtime | No | No | Partial | **Yes — outbox queues events** |
| Idempotent delivery | No | No | No | **Yes — DB-layer UNIQUE index** |
| Retry with back-off | No | No | Limited | **Yes — exponential back-off, 5 attempts** |
| Duplicate prevention | No | No | No | **Yes — idempotency key forwarded to ERP** |
| ERP-agnostic | No (SAP only) | Partial | Partial | **Yes — any HTTP endpoint** |
| Field mapping UI | No | No | No | **Yes — per-connector per-event-type** |

---

## Data Correctness

Most systems are tested for success. Trier OS is tested for failure.

| Correctness guarantee | SAP PM | IBM Maximo | MaintainX | Trier OS |
|---|---|---|---|---|
| Duplicate scan creates duplicate WO | Yes | Yes | Yes | **No — structurally impossible** |
| Part return can exceed issued qty | Yes | Yes | Yes | **No — DB constraint** |
| Missed close-outs become ghost records | Yes | Yes | Yes | **No — auto-flagged, auto-closed** |
| Offline events can replay out of order | N/A | N/A | N/A | **No — sorted by deviceTimestamp** |
| Architecture invariants enforced | No | No | No | **Yes — 11 invariants, runtime report** |
| Test philosophy | Success paths | Success paths | Success paths | **Failure paths + invariants** |
| Invariant verification endpoint | None | None | None | **`GET /api/invariants/report`** |

---

## Deployment Model

| | SAP PM | IBM Maximo | MaintainX | Trier OS |
|---|---|---|---|---|
| Deployment | Cloud / on-premise | Cloud / on-premise | Cloud only | **On-premise (single instance)** |
| Per-plant data isolation | Schema separation | Schema separation | Account separation | **Separate SQLite file per plant** |
| Cloud dependency | Required | Optional | Required | **Zero — runs air-gapped** |
| OT network safe | No (requires internet) | Partial | No | **Yes — EDR-safe local mode** |
| Cost | $150k–$1M+ annually | $75k–$500k annually | $9–$25/user/month | **Free (open source)** |
| Self-hostable | Yes (complex) | Yes (complex) | No | **Yes — `npm install && npm run dev`** |

---

## Where Competitors Are Stronger

This is the honest part.

**SAP PM**
- Deep ERP financial integration (actual RFC/BAPI clients for bidirectional sync)
- Decades of customer implementations and documented edge cases
- Native integration with SAP procurement, finance, and HR modules
- SOC2, ISO 27001, ISO 9001 certifications
- Enterprise support contracts with SLA guarantees

**IBM Maximo**
- Asset lifecycle management depth (reliability engineering, RCM, predictive maintenance models)
- Industry-specific editions (utilities, oil & gas, transportation)
- 30+ years of domain knowledge baked into workflows
- Large certified implementation partner ecosystem
- Established enterprise procurement and contracting track record

**MaintainX**
- Consumer-grade mobile UX — easier for non-technical users
- Faster onboarding (hours vs. days)
- Purpose-built for SMB maintenance teams
- Pre-built integrations with popular SaaS tools (Slack, QuickBooks, etc.)

---

## Where Trier OS Leads

- **Scan-to-execute, zero keystrokes** — no competitor does this cleanly
- **Offline-first with LAN hub** — no competitor serves an offline multi-device plant floor
- **Correctness model** — invariant enforcement is not a feature any competitor offers
- **Integration architecture** — outbox pattern with idempotency is more resilient than direct ERP coupling
- **Deployment simplicity** — single Node.js process, SQLite, no infrastructure dependencies
- **Completely free** — no per-seat licensing, no cloud dependency, no lock-in
- **Open source** — full audit trail of every line of code; no black-box vendor components
- **In-app Live Studio** — authorized modification without redeployment cycle

---

## Who Should Use Trier OS

**Good fit:**
- Manufacturing and processing plants with poor or unreliable Wi-Fi coverage
- Organizations that need air-gapped or OT-network-safe CMMS
- Teams where technicians are on the floor, not at desks
- Organizations with existing ERP that want verified operational data flowing into it
- Multi-plant operations that want per-plant isolation with corporate analytics
- Teams that want the full source code for audit, customization, or compliance

**Not a fit (yet):**
- Organizations that require SOC2 Type II or ISO certification on the CMMS itself
- Organizations that need bidirectional real-time ERP financial sync (Trier OS is outbound-only)
- Teams that need an established partner ecosystem for implementation support
- Organizations that need native SAP Fiori or Oracle Cloud UI integration

---

## Summary

Trier OS is not competing on feature checklists. It is a different execution model for the
same problem.

The market incumbents built systems around the assumption that the network is always available,
the technician has a keyboard, and the ERP is the source of truth. Trier OS inverts all three.

If those assumptions match your plant floor reality, the incumbents may serve you well.
If they don't, Trier OS was built for exactly that environment.
