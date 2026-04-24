# Trier OS Extension Point SDK

## 1. Overview
Trier OS is a single corporate deployment that provides robust extension points for ecosystem builders (ISVs, system integrators). This SDK reference details the REST API, API key management, and white-label configuration plumbing that enables partners to build upon and commercialize their Trier OS instances.

## 2. Authentication
Trier OS supports two authentication methods depending on the actor:
- **Human Users:** Authenticate via standard session cookies or `Authorization: Bearer <JWT>` containing the user's roles and permissions.
- **Machine Integrations:** Authenticate using an API key. Keys can be passed via the `?api_key=<key>` query parameter or the `Authorization: Bearer <key>` header. Machine integrations interact with the system using these pre-authorized tokens. New API keys are issued via `POST /api/docs/keys`.

## 3. API Key Scoping
API keys can be restricted to specific plant boundaries. When an API key is created, it has global access (`null` scope) by default.
- To restrict a key to specific plants, use `PUT /api/saas/api-keys/:id/scope`.
- **Payload:** `{ "scope_plants": ["Plant_1", "Plant_2"] }`
- **Validation:** All plant IDs must conform to the `SAFE_PLANT_ID` regex pattern: `^[a-zA-Z0-9_-]{1,64}$`.
- To restore global access, send `{ "scope_plants": null }`.

## 4. White-Label Configuration
Trier OS instances can be visually and functionally white-labeled to match partner branding.
- **Get Current Config:** `GET /api/saas/instance-config`
- **Update Config:** `PUT /api/saas/instance-config`
- **Configurable Fields:**
  - `instanceName`: Used for the browser tab title and email sender name.
  - `primaryColor`: Hex color code (e.g., `#2563eb`).
  - `secondaryColor`: Hex color code (e.g., `#1e40af`).
  - `supportEmail`: Email address for support inquiries.
  - `supportURL`: URL for the support portal.
  - `poweredByVisible`: Boolean flag to toggle the "Powered by Trier OS" branding.

## 5. Usage & Billing
To facilitate billing and metered usage for ecosystem builders, the platform exposes real-time usage metrics.
- **Get Live Usage:** `GET /api/saas/usage?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- **Get Billing Export:** `GET /api/saas/billing-export?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&format=json|csv`
- **Metered Metrics:**
  - `api_calls`: Total number of API requests made across all API keys (cumulative since key creation).
  - `active_users`: Number of distinct users who performed auditable actions during the period.
  - `storage_mb`: Total storage consumed by SQLite databases and uploads in megabytes.
  - `seat_count`: Total number of registered users in the authentication database.

## 6. Extension Points
Trier OS provides several interfaces for ecosystem integrations:
- **Webhooks:** Push-based event notifications (`/api/integrations/webhooks`).
- **BI Export:** Endpoints designed for Business Intelligence extraction (`/api/bi/*`).
- **Work Order API:** Programmatic management of work orders (`/api/v2/`).
- **OpenAPI Spec:** The full interactive REST API schema is available at `GET /api/docs/openapi.yaml`.

## 7. Rate Limits
To ensure system stability, machine integrations are subject to rate limiting.
- **Limit:** 100 requests per minute per API key.
- This is enforced globally by the standard `apiLimiter` middleware. Exceeding this limit will result in `429 Too Many Requests` responses.

## 8. Support
For technical assistance, users should be directed to the support channels configured in the White-Label Configuration (`supportEmail` and `supportURL`). Ecosystem builders are responsible for providing tier-1 support to their end-users.
