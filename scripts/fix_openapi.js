const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const yamlPath = path.join(__dirname, '../server/openapi.yaml');
const doc = yaml.load(fs.readFileSync(yamlPath, 'utf8'));

// 1. Fix bare $ref in responses
for (const [pathKey, methods] of Object.entries(doc.paths || {})) {
    for (const [method, operation] of Object.entries(methods)) {
        if (!operation.responses) continue;
        for (const [code, resp] of Object.entries(operation.responses)) {
            if (resp.$ref) {
                const ref = resp.$ref;
                delete resp.$ref;
                if (code.startsWith('2')) {
                    resp.description = 'Successful response';
                } else if (code === '400') {
                    resp.description = 'Bad Request';
                } else if (code === '401') {
                    resp.description = 'Unauthorized';
                } else if (code === '403') {
                    resp.description = 'Forbidden';
                } else if (code === '404') {
                    resp.description = 'Not Found';
                } else if (code === '409') {
                    resp.description = 'Conflict';
                } else {
                    resp.description = 'Error response';
                }
                resp.content = {
                    'application/json': {
                        schema: {
                            $ref: ref
                        }
                    }
                };
            }
        }
    }
}

// Helper to create a path entry
function addRoute(pathStr, method, tag, summary, isPublic = false) {
    if (!doc.paths[pathStr]) doc.paths[pathStr] = {};
    if (!doc.paths[pathStr][method]) {
        const operation = {
            tags: [tag],
            summary: summary,
            responses: {
                '200': {
                    description: 'Successful response',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object'
                            }
                        }
                    }
                }
            }
        };
        
        // Add PlantIdHeader if not public
        if (!isPublic && tag !== 'Authentication' && tag !== 'Catalog' && tag !== 'System & Admin' && tag !== 'Docs & Keys') {
            operation.parameters = [
                { $ref: '#/components/parameters/PlantIdHeader' }
            ];
        }

        // Add implicit path parameters
        const pathParams = pathStr.match(/\{([^}]+)\}/g);
        if (pathParams) {
            if (!operation.parameters) operation.parameters = [];
            for (const p of pathParams) {
                const pName = p.slice(1, -1);
                // check if parameter already exists
                if (!operation.parameters.find(existing => existing.name === pName)) {
                    operation.parameters.push({
                        name: pName,
                        in: 'path',
                        required: true,
                        schema: { type: 'string' }
                    });
                }
            }
        }

        if (isPublic) {
            operation.security = [];
        }

        if (method === 'post' || method === 'put' || method === 'patch') {
            operation.requestBody = {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            description: `Request body for ${pathStr}`
                        }
                    }
                }
            };
        }
        
        doc.paths[pathStr][method] = operation;
    }
}

// 2. Append missing tags and routes
const toAdd = [
    { p: '/api/pm-schedules', m: 'get', t: 'PM Schedules', s: 'List PM schedules for current plant' },
    { p: '/api/scan/state', m: 'get', t: 'Scan', s: 'Get scan state' },
    { p: '/api/scan', m: 'post', t: 'Scan', s: 'Process scan' },
    { p: '/api/capa', m: 'get', t: 'CAPA', s: 'List CAPA' },
    { p: '/api/capa', m: 'post', t: 'CAPA', s: 'Create CAPA' },
    { p: '/api/procedures', m: 'get', t: 'Procedures & Training', s: 'List procedures' },
    { p: '/api/training', m: 'get', t: 'Procedures & Training', s: 'List training' },
    { p: '/api/contractors', m: 'get', t: 'Contractors', s: 'List contractors' },
    { p: '/api/contractors', m: 'post', t: 'Contractors', s: 'Add contractor' },
    { p: '/api/qc', m: 'get', t: 'Quality', s: 'List QC items' },
    { p: '/api/quality', m: 'get', t: 'Quality', s: 'List quality items' },
    { p: '/api/engineering/rca', m: 'get', t: 'Engineering', s: 'List RCA' },
    { p: '/api/engineering/rca', m: 'post', t: 'Engineering', s: 'Create RCA' },
    { p: '/api/fleet/vehicles', m: 'get', t: 'Fleet', s: 'List vehicles' },
    { p: '/api/fleet/work-orders', m: 'post', t: 'Fleet', s: 'Create fleet work order' },
    { p: '/api/predictive-maintenance/rankings', m: 'get', t: 'Predictive Maint.', s: 'List rankings' },
    { p: '/api/analytics/summary', m: 'get', t: 'Analytics', s: 'Get analytics summary' },
    { p: '/api/reports', m: 'get', t: 'Reports', s: 'List reports' },
    { p: '/api/report-builder/run', m: 'post', t: 'Reports', s: 'Run custom report' },
    { p: '/api/logistics/part-requests', m: 'get', t: 'Logistics', s: 'List part requests' },
    { p: '/api/logistics/part-requests', m: 'post', t: 'Logistics', s: 'Create part request' },
    { p: '/api/it/assets', m: 'get', t: 'IT', s: 'List IT assets' },
    { p: '/api/it/assets', m: 'post', t: 'IT', s: 'Create IT asset' },
    { p: '/api/floorplans', m: 'get', t: 'Floorplans & Mapping', s: 'List floorplans' },
    { p: '/api/map-pins', m: 'get', t: 'Floorplans & Mapping', s: 'List map pins' },
    { p: '/api/plant-setup/units', m: 'get', t: 'Plant Setup', s: 'List plant units' },
    { p: '/api/devices', m: 'get', t: 'Plant Setup', s: 'List devices' },
    { p: '/api/tribal-knowledge', m: 'get', t: 'Knowledge & Comms', s: 'List tribal knowledge' },
    { p: '/api/chat/messages', m: 'get', t: 'Knowledge & Comms', s: 'List chat messages' },
    { p: '/api/shift-log', m: 'get', t: 'Production', s: 'List shift logs' },
    { p: '/api/production-import/upload', m: 'post', t: 'Production', s: 'Upload production data' },
    { p: '/api/turnaround/projects', m: 'get', t: 'Turnaround', s: 'List turnaround projects' },
    { p: '/api/turnaround/projects', m: 'post', t: 'Turnaround', s: 'Create turnaround project' },
    { p: '/api/causality/graph', m: 'get', t: 'Causality', s: 'Get causality graph' },
    { p: '/api/tools', m: 'get', t: 'Tools & Contacts', s: 'List tools' },
    { p: '/api/contacts', m: 'get', t: 'Tools & Contacts', s: 'List contacts' },
    { p: '/api/integrations/outbox', m: 'get', t: 'Integrations', s: 'List integrations outbox' },
    { p: '/api/erp-connectors', m: 'get', t: 'Integrations', s: 'List ERP connectors' },
    { p: '/api/ldap/config', m: 'get', t: 'Auth (LDAP)', s: 'Get LDAP config' },
    { p: '/api/ldap/test', m: 'post', t: 'Auth (LDAP)', s: 'Test LDAP config' },
    { p: '/api/config', m: 'get', t: 'Branding & Config', s: 'Get configuration' },
    { p: '/api/studio/files', m: 'get', t: 'Live Studio', s: 'List studio files' },
    { p: '/api/studio/exec', m: 'post', t: 'Live Studio', s: 'Execute studio action' },
    { p: '/api/warranty/claims', m: 'get', t: 'Warranty', s: 'List warranty claims' },
    { p: '/api/warranty/claims', m: 'post', t: 'Warranty', s: 'Create warranty claim' },
    { p: '/api/storeroom/abc-analysis', m: 'get', t: 'Parts & Inventory', s: 'ABC Analysis for Storeroom' },
    { p: '/api/parts/optimization/recommendations', m: 'get', t: 'Parts & Inventory', s: 'Parts optimization recommendations' }
];

toAdd.forEach(route => addRoute(route.p, route.m, route.t, route.s));

// 3. Add other missing endpoints from api_docs.js array
const missingFromApiDocs = [
    { p: '/api/work-orders/next-id', m: 'get', t: 'Work Orders', s: 'Get next work order ID' },
    { p: '/api/work-orders/{id}', m: 'delete', t: 'Work Orders', s: 'Delete work order' },
    { p: '/api/v2/work-orders/{id}/close', m: 'post', t: 'Work Orders', s: 'Close v2 work order' },
    { p: '/api/assets/{id}', m: 'put', t: 'Assets', s: 'Update asset' },
    { p: '/api/pm-schedules/calendar/events', m: 'get', t: 'PM Schedules', s: 'Get PM schedule events' },
    { p: '/api/bi/reminder-insights', m: 'get', t: 'BI Export', s: 'Get reminder insights' },
    { p: '/api/bi/technician-performance', m: 'get', t: 'BI Export', s: 'Get technician performance' },
    { p: '/api/approvals/settings', m: 'get', t: 'Approvals', s: 'Get approval settings' },
    { p: '/api/approvals/settings', m: 'put', t: 'Approvals', s: 'Update approval settings' },
    { p: '/api/approvals/{id}/approve', m: 'put', t: 'Approvals', s: 'Approve an item' },
    { p: '/api/approvals/{id}/reject', m: 'put', t: 'Approvals', s: 'Reject an item' },
    { p: '/api/integrations/webhooks', m: 'get', t: 'Integrations', s: 'List webhooks' },
    { p: '/api/integrations/webhooks', m: 'post', t: 'Integrations', s: 'Create webhook' },
    { p: '/api/integrations/webhooks/{id}', m: 'put', t: 'Integrations', s: 'Update webhook' },
    { p: '/api/integrations/webhooks/{id}', m: 'delete', t: 'Integrations', s: 'Delete webhook' },
    { p: '/api/integrations/webhooks/{id}/test', m: 'post', t: 'Integrations', s: 'Test webhook' },
    { p: '/api/risk-scoring/{plantId}', m: 'get', t: 'Analytics', s: 'Get risk score' },
    { p: '/api/risk-scoring/{plantId}', m: 'put', t: 'Analytics', s: 'Update risk score' }
];

missingFromApiDocs.forEach(route => addRoute(route.p, route.m, route.t, route.s));

fs.writeFileSync(yamlPath, yaml.dump(doc, { noRefs: true, skipInvalid: true, lineWidth: -1 }));
console.log('OpenAPI YAML fixed successfully.');
