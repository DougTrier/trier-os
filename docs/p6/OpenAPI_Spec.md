# REST API Public Spec — OpenAPI 3.1 Approach
> Trier OS P6 · Machine-readable API specification

---

## Current State

Trier OS has ~80+ route modules, all documented inline via JSDoc-style header blocks in each `routes/*.js` file following CONTRIBUTING.md conventions. No machine-readable OpenAPI spec exists yet.

---

## Recommended Tooling: `express-jsdoc-swagger`

Rather than hand-authoring a 5,000-line YAML spec, auto-generate it from the JSDoc comments already written in each route file.

```bash
npm install express-jsdoc-swagger
```

**Setup in `server/index.js`:**

```javascript
const expressJSDocSwagger = require('express-jsdoc-swagger');

const swaggerOptions = {
    info: {
        version: '3.4.0',
        title: 'Trier OS API',
        description: 'Enterprise CMMS & Advisory Platform — REST API',
        license: { name: 'Proprietary — © 2026 Trier OS' },
    },
    baseDir: __dirname,
    filesPattern: './routes/**/*.js',
    swaggerUIPath: '/api/docs',
    exposeSwaggerUI: true,
    exposeApiDocs: true,
    apiDocsPath: '/api/openapi.json',
    notRequiredAsNullable: false,
};

expressJSDocSwagger(app)(swaggerOptions);
```

This serves:
- `GET /api/docs` — Swagger UI (human-readable, try-it-out)
- `GET /api/openapi.json` — Machine-readable OpenAPI 3.1 JSON

---

## Annotation Pattern

Each route needs `@swagger` JSDoc blocks. Example for the CAPA route:

```javascript
/**
 * GET /api/capa
 * @summary List CAPA records
 * @tags CAPA
 * @param {string} rcaId.query - Filter by RCA ID
 * @param {string} plantId.query - Filter by plant
 * @param {string} status.query - Filter by status (Open|InProgress|Completed|Overdue|Cancelled)
 * @return {array<CorrectiveAction>} 200 - List of CAPA records
 * @return {object} 500 - Server error
 */
```

---

## Rollout Plan

Adding `@swagger` annotations to 80+ routes is a multi-week effort best done incrementally:

| Priority | Routes | Rationale |
|---|---|---|
| **P1 — Ship first** | work-orders, assets, scan, auth | Core operations — most used by integrators |
| **P2** | capa, moc, maintenance-kpis, safety-permits | P3/P4 features most likely to be externally consumed |
| **P3** | All remaining routes | Complete coverage for public API certification |

---

## Alternative: Postman Collection

A Postman collection (`docs/Trier_OS_API.postman_collection.json`) can be exported from Swagger UI once annotations are complete. This provides a ready-to-import API testing suite for third-party integrators without requiring OpenAPI tooling.

---

## Notes on Security

The `/api/docs` Swagger UI endpoint should be:
- Disabled in production by default (environment flag)
- Protected by the same JWT middleware as all other `/api` routes if enabled
- Never exposed on a public network interface
