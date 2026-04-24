# Trier OS Digital Twin External Platform Integration

## 1. Overview
The Digital Twin External Platform Integration provides a synchronization bridge between the internal Trier OS asset registry and third-party digital twin platforms. While the internal digital twin module (`/api/digital-twin`) handles schematics, pin placements, and sensor overlays directly within Trier OS, this external bridge focuses on data synchronization. The v1 scope specifically targets the Bentley iTwin platform and synchronizes asset registry metadata without exchanging work order or sensor telemetry.

## 2. Scoping Decisions
| Decision Area | Selected Approach | Rationale |
|---------------|-------------------|-----------|
| **Target Platform** | Bentley iTwin Platform | Provides a robust, well-documented REST API with standard OAuth2 client credentials, making headless server-to-server integration straightforward. |
| **Sync Scope** | Asset registry metadata | V1 focuses on establishing the physical hierarchy. Excludes dynamic work order and sensor telemetry data. |
| **Conflict Resolution** | Split ownership | Trier OS is the source of truth for operational fields (Status, Criticality). The external platform owns spatial fields (Coordinates, GeometryModelId). Conflicts are avoided by merging distinct domains. |

## 3. Bentley iTwin Platform
The Bentley iTwin platform serves as the spatial system of record.
- **REST API:** The integration relies on the iTwin REST API for asset queries and updates.
- **Authentication:** Standard OAuth2 Client Credentials flow. The server requests a Bearer token using the `ClientId` and `ClientSecret` before making asset API calls.
- **Required Credentials:**
  - `TenantId`: Identifies the corporate tenant.
  - `ClientId`: The OAuth2 application identifier.
  - `ClientSecret`: The OAuth2 application secret (stored securely).
  - `IModelId`: The specific 3D model/project identifier.

## 4. Configuration
The integration is configured on a per-plant basis.
- **Endpoint:** `POST /api/dt-sync/config`
- **Fields:** `plantId`, `platform`, `instanceURL`, `tenantId`, `clientId`, `clientSecret`, `iModelId`, `syncDirection`
- **Platform Options:** `BENTLEY_ITWIN`, `SIEMENS_NX`, `PTC_THINGWORX`
- **Sync Direction:** `OUTBOUND`, `INBOUND`, `BIDIRECTIONAL`

## 5. Sync Operations
Synchronization is triggered manually per plant.
- **OUTBOUND (Push):** Trier OS pushes operational asset data (`ID`, `AssetName`, `AssetType`, `Status`, `CriticalityRating`, `LastMaintenanceDate`) to the external platform.
- **INBOUND (Pull):** Trier OS pulls spatial and installation metadata (`SpatialLocation`, `GeometryModelId`) from the external platform into the asset registry.
- **Conflict Resolution:** No field overlaps exist in the v1 scope. Operational fields overwrite external attributes; spatial fields overwrite internal attributes.

## 6. Security
External integrations carry inherent security risks that are mitigated through strict controls:
- **SSRF Protection (Rule S-6):** Every outbound request URL is strictly validated. Private, loopback, and local network ranges are explicitly blocked to prevent Server-Side Request Forgery.
- **HTTPS Enforced:** Only `https:` and `http:` protocols are permitted. (Production instances should strictly use HTTPS).
- **Credential Storage:** `ClientSecret` is stored in the `DTSyncConfig` table and is automatically masked as `***` when queried via the API to prevent exposure to front-end clients.

## 7. v1 Limitations
- **Simulation Mode:** Until valid customer credentials are provided and tested, the endpoints operate in a simulated mode that maps the payloads and logs success without transmitting data.
- **Manual Trigger:** Synchronization must be triggered manually via the API; there is no scheduled CRON sync in v1.
- **Scope Restriction:** Work orders, inventory, and sensor telemetry are explicitly excluded from this sync.

## 8. Extending to Other Platforms
The architecture is designed to support additional platforms:
- **Siemens NX / PTC ThingWorx:** To add support, append the new identifier to the `Platform` enum.
- **Implementation:** Create a new platform-specific mapper module that translates the generic Trier OS asset payload (`TrierOS:Asset`) into the proprietary JSON shape required by the target vendor's API.
