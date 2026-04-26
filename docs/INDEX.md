# Trier OS — Documentation Index

All docs are in `docs/`. This index groups them by purpose.

---

## Concepts — Understand how it's built

| Document | What it covers |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System topology, multi-tenancy, DB routing, key patterns |
| [SYSTEM_TOPOLOGY.md](./SYSTEM_TOPOLOGY.md) | One-page map: device → LAN hub → server → DB → engines. Three concrete request traces. |
| [ARCHITECTURE_INVARIANTS.md](./ARCHITECTURE_INVARIANTS.md) | 11 correctness invariants: what they are, how they're enforced, runtime proof via `/api/invariants/report` |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Table definitions, relationships, migration history |
| [SECURITY_CONTROLS.md](./SECURITY_CONTROLS.md) | SOC2-aligned inventory of all security controls with file paths and honest gaps |
| [THREAT_MODEL.md](./THREAT_MODEL.md) | Trust boundaries, attack surface, in-scope vs out-of-scope threats |

---

## Integrations — Connect to external systems

| Document | What it covers |
|---|---|
| [INTEGRATIONS.md](./INTEGRATIONS.md) | Full inventory of all external connectivity (LDAP, SMTP, webhooks, sensors, OPC-UA, Modbus, OCR, DXF, AI, etc.) |
| [ERP_INTEGRATION_GUIDE.md](./ERP_INTEGRATION_GUIDE.md) | Outbound event stream: payload formats, SAP OData path, Dynamics 365, Oracle Fusion, custom HTTP receiver |

---

## Operations — Install, run, and maintain

| Document | What it covers |
|---|---|
| [INSTALL_GUIDE.html](./INSTALL_GUIDE.html) | Step-by-step installation guide (Windows installer + from source) |
| [DEMO_CREDENTIALS.md](./DEMO_CREDENTIALS.md) | Ghost accounts and demo login details for development |
| [DEMO_DATA.md](./DEMO_DATA.md) | What demo data is seeded and why |
| [QUICK_FACTS.md](./QUICK_FACTS.md) | Port numbers, default paths, environment variables at a glance |

---

## Evaluation — Understand the product

| Document | What it covers |
|---|---|
| [WHY_TRIER_OS.md](./WHY_TRIER_OS.md) | Honest comparison vs SAP PM, IBM Maximo, MaintainX — including where competitors are stronger |
| [PILOT_GUIDE.md](./PILOT_GUIDE.md) | Plain-language guide for plant managers and supervisors evaluating Trier OS |
| [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) | 5-minute facilitated demo walkthrough — what to click, what story to tell |

---

## Quality & Testing

| Document | What it covers |
|---|---|
| [ARCHITECTURE_INVARIANTS.md](./ARCHITECTURE_INVARIANTS.md) | Invariant definitions and enforcement evidence |
| `tests/e2e/` | Playwright E2E suite — 38 spec files, 1463 tests, run against live instance |
| [Playwright Results PDF](./Playwrite%20Report%20Desktop%20and%20Mobile%204-25-2026.pdf) | Full test run results from v3.6.1 pre-release verification |

---

## Contributing & Governance

| Document | What it covers |
|---|---|
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Coding standards, header format, PR requirements, 10% density rule |
| [`CLAUDE.md`](../CLAUDE.md) | AI-assisted development guide — patterns, security rules, release checklist |
| [CONTRIBUTOR_MAP.md](./CONTRIBUTOR_MAP.md) | Invariant governance lifecycle: identify → enforce → observe → prove → gate |
| [followups.yaml](./followups.yaml) | Machine-checkable deferred item registry with trigger gates and decision log |

---

## Roadmap & History

| Document | What it covers |
|---|---|
| [`ROADMAP.md`](../ROADMAP.md) | Current and planned work |
| [`CHANGELOG.md`](../CHANGELOG.md) | Full version history with specific fixes and feature additions |

---

## For New Engineers — Start Here

If you're arriving at this codebase for the first time, read these five things in order:

1. **[SYSTEM_TOPOLOGY.md](./SYSTEM_TOPOLOGY.md)** — understand the full request path before touching any code
2. **[CLAUDE.md](../CLAUDE.md)** — the development guide; overrides all other defaults
3. **`server/routes/scan.js`** — the core scan state machine; the most critical file in the system
4. **[ARCHITECTURE_INVARIANTS.md](./ARCHITECTURE_INVARIANTS.md)** — what correctness means here and how it's enforced
5. **[CONTRIBUTOR_MAP.md](./CONTRIBUTOR_MAP.md)** — the governance model; how changes move from idea to production
