# Trier OS Distributed Edge Execution Mesh: Scoping & Architecture

## 1. Artifact Type Inventory
The mesh distributes large, static, read-heavy assets to plant-local edge nodes to eliminate WAN latency and maintain offline availability.

| Artifact Type | Current Storage Mechanism | Size Profile | Update Freq. | LAN Hub Today | Mesh Candidate? |
| --- | --- | --- | --- | --- | --- |
| **3D Digital Twin Models** | Database binary / File paths | 50MB - 200MB | Very Low | No | **YES** |
| **SOP / Procedure PDFs** | File paths in procedures | 1MB - 10MB | Low | No | **YES** |
| **Training Videos** | External links / File paths | 100MB - 1GB | Very Low | No | **YES** |
| **Firmware Packages** | Not currently in scope | N/A | N/A | No | **NO** (Out of scope) |
| **Offline DB Snapshots** | Handled explicitly by HA sync | 50MB - 200MB | High | Yes | **NO** (HA purview) |

## 2. LAN Hub Extension vs. Separate Agent
**Decision:** Option B — Separate Edge Node System (Or isolated spawned process).
**Rationale:** The existing `lan_hub.js` is a fragile, mission-critical component responsible for the offline scan state machine. The Zero-Keystroke Contract demands 100% uptime for local scanning. Introducing large binary file transfers, disk I/O bursts, and a general-purpose HTTP artifact server into the same Electron process introduces an unacceptable blast radius. If a 1GB video transfer OOMs the LAN Hub, the plant loses the ability to perform offline scans. The artifact server must operate as a completely isolated process that does not share state or memory with `lan_hub.js`.

## 3. P2P Relay vs. Hub-and-Spoke
**Decision:** Hub-and-Spoke.
**Rationale:** The "P2P" concept is rejected. Industrial plants operate on known, fixed, and highly secure corporate network topologies. Attempting to build inter-plant peer-to-peer discovery, NAT traversal, and mutual authentication adds extreme complexity with near-zero real-world value. A plant offline from corporate is not magically connected to a neighboring plant via a separate link. A strictly managed hub-and-spoke model (Corporate → Plant Edge Node) is completely sufficient and infinitely more secure.

## 4. Security Model
Artifacts delivered to the edge must be tamper-evident to prevent the localized serving of malicious payloads.
- **Signing Algorithm:** Asymmetric Ed25519 signing. Artifacts are signed at corporate.
- **Key Distribution:** For v1, the Ed25519 public key is bundled directly into the Edge Node binary. The private key remains exclusively on the corporate server.
- **Manifest Format:** Every artifact bundle contains a `manifest.json`: `{ artifactId, type, version, plantId, contentHash (SHA-256), signature, expiresAt }`.
- **Verification:** The Edge Node computes the SHA-256 hash of the received artifact and verifies it against the signed manifest using the bundled public key before making it available over HTTP.
- **Revocation/Expiry:** The `expiresAt` field acts as a soft revocation. A forced hard revocation is managed by corporate pushing a tombstone manifest.

## 5. Distribution Protocol
**Decision:** Scheduled Pull Model via HTTPS.
**Rationale:** Attempting to push gigabytes of data from corporate down to a plant often triggers inbound firewall violations. Instead, the Edge Node polls a new corporate endpoint (`GET /api/edge-mesh/pull-manifest`) on a schedule. If a new manifest is detected, the Edge Node initiates an HTTPS download of the artifact `.zip` bundle. 

## 6. Edge Storage Design
- **Path Location:** Managed relative to the app data directory using `resolve_data_dir` (e.g., `<appDataDir>/trier-artifacts/`).
- **Storage Budget:** Capped at 20GB per plant.
- **Eviction Policy:** Strict Versioning. When v2 of an artifact is verified and mounted, v1 is immediately soft-deleted (retained for 24 hours to drain active reads, then purged). LRU is used if the 20GB ceiling is reached.

## 7. Corporate-Side Management
- **Storage:** Artifact metadata resides centrally in `trier_logistics.db` for global visibility. Artifact binary BLOBs are stored entirely on the corporate disk (file paths), *not* inside SQLite, avoiding database bloat.
- **Routing:** New router module (`server/routes/edge_mesh.js`) mounted at `/api/edge-mesh/` handling manifest generation, artifact listing, and payload serving for edge nodes.
- **Admin UI:** Provides a fleet-wide matrix showing which plants hold which artifact versions, highlighting out-of-sync nodes.

## 8. Go / No-Go Decision
This capability does not interact with the transactional write paths and is completely orthogonal to the deferred P2-2 Gatekeeper. There are no architectural blocking prerequisites.

**Itemized Decisions:**
1. **Hub-and-spoke artifact replication:** **GO**.
2. **Local artifact serving at the edge node:** **GO** (Implemented strictly as a separate process from `lan_hub.js`).
3. **Artifact signing and verification:** **GO** (Ed25519 manifest model).
4. **P2P inter-plant relay:** **NO-GO** (Permanently rejected due to network reality).
5. **Artifact bundle expiry / revocation:** **GO**.

**Overall Decision: GO.** Implementation can proceed cleanly.
