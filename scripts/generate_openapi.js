const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const routesDir = path.join(__dirname, '../server/routes');

const tagMapping = {
    'auth': 'Authentication',
    'workOrders': 'Work Orders',
    'assets': 'Assets',
    'parts': 'Parts & Inventory',
    'storeroom': 'Parts & Inventory',
    'spare-parts-optimization': 'Parts & Inventory',
    'pmSchedules': 'PM Schedules',
    'schedules': 'PM Schedules',
    'scan': 'Scan',
    'safety_incidents': 'Safety & Permits',
    'safety_permits': 'Safety & Permits',
    'loto': 'LOTO',
    'locks': 'LOTO',
    'moc': 'MOC',
    'procedures': 'Procedures & SOPs',
    'sop-acknowledgment': 'Procedures & SOPs',
    'training': 'Training',
    'enrollment': 'Training',
    'contractors': 'Contractors',
    'purchaseOrders': 'Purchase Orders',
    'approvals': 'Purchase Orders',
    'qc': 'Quality',
    'product-quality': 'Quality',
    'calibration': 'Quality',
    'capa': 'Quality',
    'containment': 'Quality',
    'predictive_maintenance': 'Predictive Maintenance',
    'vibration': 'Predictive Maintenance',
    'sensors': 'Predictive Maintenance',
    'baseline_engine': 'Predictive Maintenance',
    'energy': 'Energy & Utilities',
    'utilities': 'Energy & Utilities',
    'compliance': 'Compliance',
    'analytics': 'Analytics & BI',
    'biExport': 'Analytics & BI',
    'corporate-analytics': 'Analytics & BI',
    'maintenance_kpis': 'Analytics & BI',
    'maintenance_budget': 'Analytics & BI',
    'opex_tracking': 'Analytics & BI',
    'enhancedReports': 'Analytics & BI',
    'reportBuilder': 'Analytics & BI',
    'leadership': 'Analytics & BI',
    'asset-lifecycle': 'Asset Lifecycle',
    'shift-handover': 'Shift Handover',
    'shiftLog': 'Shift Handover',
    'vendor_portal': 'Vendor Management',
    'vendor-scorecard': 'Vendor Management',
    'catalog': 'Catalog',
    'catalog_enrichment': 'Catalog',
    'it_catalog': 'Catalog',
    'engineering': 'Engineering',
    'digitalTwin': 'Engineering',
    'floorplans': 'Engineering',
    'map-pins': 'Engineering',
    'notifications': 'Notifications',
    'watchlist': 'Notifications',
    'escalation': 'Notifications',
    'config': 'System & Admin',
    'plant_setup': 'System & Admin',
    'health': 'System & Admin',
    'ha': 'System & Admin',
    'device-registry': 'System & Admin',
    'api_docs': 'System & Admin',
    'branding': 'System & Admin',
    'ldap': 'System & Admin',
    'desktop': 'System & Admin',
    'translate': 'System & Admin',
    'integrations-outbox': 'System & Admin',
    'erp_connectors': 'System & Admin',
    'crosslinks': 'System & Admin',
    'database': 'System & Admin',
    'supply_chain_seed': 'System & Admin',
    'gap_features': 'System & Admin',
    'creator_console': 'System & Admin',
    'live_studio': 'System & Admin',
    'import_engine': 'System & Admin',
    'production_import': 'System & Admin',
    'dxf-import': 'System & Admin',
    'lidar-import': 'System & Admin',
    'ocr': 'System & Admin',
    'index': 'System & Admin',
};

const fullSchemaEndpoints = [
    'POST /api/auth/login',
    'POST /api/auth/register',
    'POST /api/work-orders',
    'PUT /api/work-orders/{id}',
    'POST /api/assets',
    'POST /api/parts',
    'POST /api/scan',
    'POST /api/loto/permits',
    'POST /api/safety-incidents',
    'POST /api/purchase-orders'
];

let openapi = {
    openapi: '3.1.0',
    info: {
        title: 'Trier OS API',
        version: '3.5.1',
        description: 'Enterprise Industrial Operating System REST API.\nSingle corporate server — all plants connect here.\nSet x-plant-id header on all plant-scoped requests.\nAuth via Bearer JWT (login) or api_key query param.\n'
    },
    servers: [
        {
            url: 'http://localhost:3001',
            description: 'Local development'
        }
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT'
            },
            apiKey: {
                type: 'apiKey',
                in: 'query',
                name: 'api_key'
            }
        },
        parameters: {
            PlantIdHeader: {
                name: 'x-plant-id',
                in: 'header',
                required: true,
                schema: {
                    type: 'string',
                    pattern: '^[a-zA-Z0-9_-]{1,64}$'
                },
                description: 'Plant identifier. Scopes all reads/writes to that plant database.'
            }
        },
        schemas: {
            Error: {
                type: 'object',
                properties: {
                    error: { type: 'string' }
                }
            },
            Success: {
                type: 'object',
                properties: {
                    success: { type: 'boolean' }
                }
            },
            WorkOrder: {
                type: 'object',
                properties: {
                    ID: { type: 'string' },
                    AstID: { type: 'string' },
                    StatusID: { type: 'string' },
                    Priority: { type: 'string' },
                    Description: { type: 'string' },
                    AssignedTo: { type: 'string' },
                    CreateDate: { type: 'string', format: 'date-time' }
                }
            },
            Asset: {
                type: 'object',
                properties: {
                    ID: { type: 'string' },
                    Description: { type: 'string' },
                    AssetType: { type: 'string' },
                    Location: { type: 'string' },
                    Active: { type: 'integer' }
                }
            },
            Part: {
                type: 'object',
                properties: {
                    ID: { type: 'string' },
                    Description: { type: 'string' },
                    QtyOnHand: { type: 'number' },
                    UOM: { type: 'string' },
                    UnitCost: { type: 'number' }
                }
            }
        }
    },
    security: [
        { bearerAuth: [] },
        { apiKey: [] }
    ],
    tags: [
        { name: 'Authentication' },
        { name: 'Work Orders' },
        { name: 'Assets' },
        { name: 'Parts & Inventory' },
        { name: 'PM Schedules' },
        { name: 'Scan' },
        { name: 'Safety & Permits' },
        { name: 'LOTO' },
        { name: 'MOC' },
        { name: 'Procedures & SOPs' },
        { name: 'Training' },
        { name: 'Contractors' },
        { name: 'Purchase Orders' },
        { name: 'Quality' },
        { name: 'Predictive Maintenance' },
        { name: 'Energy & Utilities' },
        { name: 'Compliance' },
        { name: 'Analytics & BI' },
        { name: 'Asset Lifecycle' },
        { name: 'Shift Handover' },
        { name: 'Vendor Management' },
        { name: 'Catalog' },
        { name: 'Engineering' },
        { name: 'Notifications' },
        { name: 'System & Admin' }
    ],
    paths: {}
};

const regex = /router\.(get|post|put|delete|patch)\(\s*['"`](.*?)['"`]/g;

// Try to parse mounts from index.js
const mountMapping = {};
try {
    const indexContent = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
    const mountRegex = /app\.use\(['"`](.*?)['"`],\s*require\(['"`]\.\/routes\/(.*?)['"`]\)\)/g;
    let match;
    while ((match = mountRegex.exec(indexContent)) !== null) {
        let base = match[1];
        let file = match[2];
        if (file.endsWith('.js')) file = file.slice(0, -3);
        mountMapping[file] = base;
    }
} catch (e) {
    console.error("Could not parse index.js mounts", e);
}

// Manually ensure standard mounts if not captured correctly
const standardMounts = {
    'auth': '/api/auth',
    'workOrders': '/api/work-orders',
    'assets': '/api/assets',
    'parts': '/api/parts',
    'scan': '/api/scan',
    'safety_incidents': '/api/safety-incidents',
    'safety_permits': '/api/safety-permits',
    'loto': '/api/loto',
    'purchaseOrders': '/api/purchase-orders',
    'api_docs': '/api/docs',
    'catalog': '/api/catalog'
};
Object.assign(mountMapping, standardMounts);

const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
for (const file of routeFiles) {
    const filename = file.replace('.js', '');
    const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
    
    let match;
    const tag = tagMapping[filename] || 'System & Admin';
    const baseMount = mountMapping[filename] || `/api/${filename}`;

    while ((match = regex.exec(content)) !== null) {
        const method = match[1];
        let routePath = match[2];
        
        let fullPath = `${baseMount}${routePath}`.replace(/\/+/g, '/');
        if (fullPath.endsWith('/') && fullPath.length > 1) fullPath = fullPath.slice(0, -1);
        
        // Convert express :param to {param}
        fullPath = fullPath.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');

        if (!openapi.paths[fullPath]) {
            openapi.paths[fullPath] = {};
        }

        const endpointStr = `${method.toUpperCase()} ${fullPath}`;

        const operation = {
            tags: [tag],
            responses: {
                '200': {
                    description: 'Successful response',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/Success'
                            }
                        }
                    }
                },
                '400': {
                    description: 'Bad Request',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/Error'
                            }
                        }
                    }
                },
                '401': {
                    description: 'Unauthorized',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/Error'
                            }
                        }
                    }
                },
                '403': {
                    description: 'Forbidden',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/Error'
                            }
                        }
                    }
                },
                '404': {
                    description: 'Not Found',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/Error'
                            }
                        }
                    }
                },
                '500': {
                    description: 'Server Error',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/Error'
                            }
                        }
                    }
                }
            }
        };

        // PlantIdHeader for non-auth endpoints
        if (tag !== 'Authentication' && tag !== 'Catalog' && tag !== 'System & Admin') {
            operation.parameters = [
                { $ref: '#/components/parameters/PlantIdHeader' }
            ];
        }

        // Add path parameters implicitly
        const pathParams = fullPath.match(/\{([^}]+)\}/g);
        if (pathParams) {
            if (!operation.parameters) operation.parameters = [];
            for (const p of pathParams) {
                const pName = p.slice(1, -1);
                operation.parameters.push({
                    name: pName,
                    in: 'path',
                    required: true,
                    schema: { type: 'string' }
                });
            }
        }

        if (tag === 'Authentication') {
            operation.security = [];
        }

        if (method === 'post' || method === 'put' || method === 'patch') {
            if (fullSchemaEndpoints.includes(endpointStr)) {
                let schemaRef = '#/components/schemas/Success';
                if (endpointStr.includes('work-orders')) schemaRef = '#/components/schemas/WorkOrder';
                if (endpointStr.includes('assets')) schemaRef = '#/components/schemas/Asset';
                if (endpointStr.includes('parts')) schemaRef = '#/components/schemas/Part';

                operation.requestBody = {
                    content: {
                        'application/json': {
                            schema: {
                                $ref: schemaRef
                            }
                        }
                    }
                };
            } else {
                operation.requestBody = {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                description: `Request body for ${fullPath}`
                            }
                        }
                    }
                };
            }
        }

        openapi.paths[fullPath][method] = operation;
    }
}

fs.writeFileSync(path.join(__dirname, '../server/openapi.yaml'), yaml.dump(openapi, { noRefs: true, skipInvalid: true, lineWidth: -1 }));
console.log('OpenAPI YAML generated successfully.');
