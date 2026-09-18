// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Copyright © 2026 Doug Trier. SPDX-License-Identifier: MIT.
 * Security remediation — server authorization regressions.
 * Tests actual disposable application APIs without database mocks. Published
 * demo identities are low trust; ordinary staff cross-plant search is intentional.
 * API dependencies: POST /api/auth/login; GET /api/assets;
 * POST /api/quality/loss-log; PUT /api/network-config/static-ip.
 */
import { test, expect } from '@playwright/test';
import { request as apiRequest } from '@playwright/test';
import OTPAuth from 'otpauth';

const demoUsers = ['demo_tech', 'demo_operator', 'demo_maint_mgr', 'demo_plant_mgr'];
for (const username of demoUsers) {
  test(`SEC-01 ${username} cannot override examples scope`, async ({ request }) => {
    expect((await request.post('/api/auth/login', { data: { username, password: 'TrierDemo2026!' } })).status()).toBe(200);
    const examples = { 'x-plant-id': 'examples' };
    expect((await request.get('/api/assets?limit=1', { headers: examples })).status()).toBe(200);
    for (const plantId of ['Plant_1', 'Plant_2', 'all_sites']) {
      expect((await request.get('/api/assets?limit=1', { headers: { 'x-plant-id': plantId } })).status(), `header ${plantId}`).toBe(403);
      expect((await request.get(`/api/assets?plantId=${plantId}`, { headers: examples })).status(), `query ${plantId}`).toBe(403);
      expect((await request.post(`/api/quality/loss-log?plantId=${plantId}`, { headers: examples, data: {} })).status(), `query write ${plantId}`).toBe(403);
      expect((await request.post('/api/quality/loss-log', { headers: examples, data: { plantId } })).status(), `body ${plantId}`).toBe(403);
    }
    expect((await request.post('/api/quality/loss-log', { headers: examples, data: { rows: [{ PlantID: 'Plant_1' }] } })).status()).toBe(403);
    // Omitting selection must safely keep the public demo experience in examples.
    expect((await request.get('/api/assets?limit=1')).status()).toBe(200);
    const plans = await request.get('/api/floorplans', { headers: examples });
    expect(plans.status()).toBe(200);
    expect((await plans.json()).every(plan => plan.plantId === 'examples')).toBe(true);
    expect((await request.post('/api/floorplans', { headers: examples, multipart: {
      plantId: 'Plant_1', name: 'Denied foreign multipart', floorplan: { name: 'valid.png', mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC', 'base64') },
    } })).status()).toBe(403);
  });
}

test('SEC-01 ordinary authorized staff retain cross-plant search', async ({ request }) => {
  expect((await request.post('/api/auth/login', { data: { username: 'ghost_admin', password: 'Trier3652!' } })).status()).toBe(200);
  for (const plantId of ['Plant_1', 'Plant_2', 'all_sites']) {
    expect((await request.get('/api/assets?limit=1', { headers: { 'x-plant-id': plantId } })).status()).toBe(200);
  }
});

test('SEC-01 decoded floorplan IDs cannot bypass demo ownership', async ({ request }) => {
  const admin = async () => expect((await request.post('/api/auth/login', { data: { username: 'ghost_admin', password: 'Trier3652!' } })).status()).toBe(200);
  await admin();
  const created = await request.post('/api/floorplans', { headers: { 'x-plant-id': 'Plant_1' }, multipart: {
    plantId: 'Plant_1', name: 'Security ownership regression', floorplan: { name: 'valid.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC', 'base64') },
  } });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const encoded = String(id).split('').map(character => '%' + character.charCodeAt(0).toString(16)).join('');
  let exampleId;
  const children = [];
  try {
    const example = await request.post('/api/floorplans', { headers: { 'x-plant-id': 'examples' }, multipart: {
      plantId: 'examples', name: 'Security local ownership regression', floorplan: { name: 'valid.png', mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC', 'base64') },
    } });
    expect(example.status()).toBe(201);
    exampleId = (await example.json()).id;
    for (const [resource, data] of [
      ['pins', { assetId: 'security-fixture-asset', xPercent: 1, yPercent: 1, label: 'Foreign pin' }],
      ['annotations', { type: 'text', points: [{ x: 1, y: 1 }], label: 'Foreign annotation' }],
      ['zones', { name: 'Foreign zone', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] }],
      ['sensors', { name: 'Foreign sensor', xPercent: 1, yPercent: 1 }],
    ]) {
      const child = await request.post(`/api/floorplans/${id}/${resource}`, { headers: { 'x-plant-id': 'Plant_1' }, data });
      expect(child.status(), resource).toBe(201);
      children.push({ resource, id: (await child.json()).id, data });
    }
    for (const username of demoUsers) {
      expect((await request.post('/api/auth/login', { data: { username, password: 'TrierDemo2026!' } })).status()).toBe(200);
      const headers = { 'x-plant-id': 'examples' };
      for (const child of children) {
        // An examples parent must not authorize a child belonging to a foreign plan.
        expect((await request.put(`/api/floorplans/${exampleId}/${child.resource}/${child.id}`, { headers, data: child.data })).status(), `${username}: foreign ${child.resource}`).toBe(403);
        expect((await request.delete(`/api/floorplans/${exampleId}/${child.resource}/${child.id}`, { headers })).status()).toBe(403);
      }
      for (const selected of [String(id), encoded, id + '.0', id + 'e0', '+' + id]) {
        expect((await request.get(`/api/floorplans/${selected}/pins`, { headers })).status(), `${username}: ${selected}`).toBe(403);
      }
      expect((await request.post(`/api/floorplans/${encoded}/pins`, { headers, data: {} })).status()).toBe(403);
      expect((await request.put(`/api/floorplans/${encoded}/pins/999999999`, { headers, data: {} })).status()).toBe(403);
    }
  } finally {
    await admin();
    for (const child of children) {
      expect((await request.delete(`/api/floorplans/${id}/${child.resource}/${child.id}`, { headers: { 'x-plant-id': 'Plant_1' } })).status()).toBe(200);
    }
    if (exampleId) expect((await request.delete('/api/floorplans/' + exampleId, { headers: { 'x-plant-id': 'examples' } })).status()).toBe(200);
    expect((await request.delete('/api/floorplans/' + id, { headers: { 'x-plant-id': 'Plant_1' } })).status()).toBe(200);
  }
});

for (const username of [...demoUsers, 'ghost_tech']) {
  test(`SEC-02 ${username} rejected before network handler invocation`, async ({ request }) => {
    const password = username === 'ghost_tech' ? 'Trier3292!' : 'TrierDemo2026!';
    expect((await request.post('/api/auth/login', { data: { username, password } })).status()).toBe(200);
    const response = await request.put('/api/network-config/static-ip', {
      headers: { 'x-plant-id': username === 'ghost_tech' ? 'Demo_Plant_1' : 'examples' }, data: {},
    });
    expect(response.status()).toBe(403);
  });
}

test('SEC-04 rejects executable and disguised floorplan uploads', async ({ request }) => {
  expect((await request.post('/api/auth/login', { data: { username: 'demo_plant_mgr', password: 'TrierDemo2026!' } })).status()).toBe(200);
  for (const name of ['attack.html', 'attack.js', 'attack.png']) {
    const response = await request.post('/api/floorplans', {
      headers: { 'x-plant-id': 'examples' },
      multipart: { plantId: 'examples', name: 'Security rejection regression', floorplan: { name, mimeType: 'image/png', buffer: Buffer.from('<!doctype html><script>fetch("/api/auth/me")</script>') } },
    });
    expect(response.status(), name).toBe(400);
  }
});

test('SEC-04 supported image upload remains usable', async ({ request }) => {
  expect((await request.post('/api/auth/login', { data: { username: 'demo_plant_mgr', password: 'TrierDemo2026!' } })).status()).toBe(200);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC', 'base64');
  const response = await request.post('/api/floorplans', {
    headers: { 'x-plant-id': 'examples' }, multipart: { plantId: 'examples', name: 'Security legitimate image regression', floorplan: { name: 'valid.png', mimeType: 'image/png', buffer: png } },
  });
  expect(response.status()).toBe(201);
  const created = await response.json();
  try { expect((await request.get(created.imagePath)).status()).toBe(200); }
  finally { expect((await request.delete('/api/floorplans/' + created.id, { headers: { 'x-plant-id': 'examples' } })).status()).toBe(200); }
});

test('SEC-04 historical active attachments cannot execute in an authenticated browser', async ({ page }) => {
  const activePath = process.env.TRIER_UNSAFE_UPLOAD_PATH;
  const scriptPath = process.env.TRIER_UNSAFE_SCRIPT_PATH;
  if (!activePath || !scriptPath) throw new Error('Requires explicit historical active-upload fixtures in the disposable data directory');
  expect((await page.request.post('/api/auth/login', { data: { username: 'ghost_admin', password: 'Trier3652!' } })).status()).toBe(200);
  const response = await page.request.get(activePath);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/octet-stream');
  expect(response.headers()['content-disposition']).toContain('attachment');
  expect(response.headers()['content-security-policy']).toContain('sandbox');
  await page.goto('/');
  const download = page.waitForEvent('download');
  await page.evaluate(url => { const a = document.createElement('a'); a.href = url; document.body.append(a); a.click(); }, activePath);
  await download;
  expect(await page.evaluate(() => document.documentElement.dataset.auditScriptRan)).toBeUndefined();
  const scriptResponse = await page.request.get(scriptPath);
  expect(scriptResponse.status()).toBe(200);
  expect(scriptResponse.headers()['x-content-type-options']).toBe('nosniff');
  expect(await page.evaluate(url => new Promise(resolve => {
    const script = document.createElement('script'); script.src = url;
    script.onload = () => resolve('executed'); script.onerror = () => resolve('blocked'); document.head.append(script);
  }), scriptPath)).toBe('blocked');
});

test('DEP-multer excessive multipart array indices rejected before parsing', async ({ request }) => {
  expect((await request.post('/api/auth/login', { data: { username: 'demo_plant_mgr', password: 'TrierDemo2026!' } })).status()).toBe(200);
  const response = await request.post('/api/floorplans', { headers: { 'x-plant-id': 'examples' }, multipart: {
    plantId: 'examples', name: 'Multipart bounded regression', 'items[1001]': 'bounded-safe-probe',
    floorplan: { name: 'valid.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC', 'base64') },
  } });
  if (response.status() === 201) {
    const created = await response.json();
    expect((await request.delete('/api/floorplans/' + created.id, { headers: { 'x-plant-id': 'examples' } })).status()).toBe(200);
  }
  expect(response.status()).toBe(400);
});

test('SEC-05 pre-2FA token only works for two-factor completion', async () => {
  const password = process.env.TRIER_SECURITY_TEST_CREATOR_PASSWORD;
  if (!password) throw new Error('Requires explicit disposable creator test credentials');
  const enrolled = await apiRequest.newContext({ baseURL: 'https://localhost:1938', ignoreHTTPSErrors: true });
  const partial = await apiRequest.newContext({ baseURL: 'https://localhost:1938', ignoreHTTPSErrors: true });
  let totp, enabled = false;
  try {
    const login = await enrolled.post('/api/auth/login', { data: { username: 'creator', password } });
    expect(login.status()).toBe(200); expect((await login.json()).requires2FA).toBeFalsy();
    const setup = await enrolled.post('/api/creator/settings/totp-setup', { data: {}, headers: { 'x-plant-id': 'all_sites' } });
    expect(setup.status()).toBe(200);
    const secret = (await setup.json()).manualKey;
    if (!secret) throw new Error('Missing disposable TOTP enrollment');
    totp = new OTPAuth.TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
    expect((await enrolled.post('/api/creator/settings/totp-verify', { data: { code: totp.generate() }, headers: { 'x-plant-id': 'all_sites' } })).status()).toBe(200);
    enabled = true;
    const passwordOnly = await partial.post('/api/auth/login', { data: { username: 'creator', password } });
    const challenge = await passwordOnly.json(); expect(challenge.requires2FA).toBe(true);
    const headers = { Authorization: 'Bearer ' + challenge.preAuthToken, 'x-plant-id': 'Plant_1' };
    expect((await partial.get('/api/assets?limit=1', { headers })).status()).toBe(401);
    expect((await partial.post('/api/quality/loss-log', { headers, data: {} })).status()).toBe(401);
    expect((await partial.get('/api/ha/status', { headers })).status()).toBe(401);
    const completed = await partial.post('/api/auth/verify-2fa', { data: { preAuthToken: challenge.preAuthToken, code: totp.generate() } });
    expect(completed.status()).toBe(200);
    expect((await partial.get('/api/assets?limit=1', { headers: { 'x-plant-id': 'Plant_1' } })).status()).toBe(200);
  } finally {
    if (enabled) expect((await enrolled.post('/api/creator/settings/totp-disable', { data: { code: totp.generate() }, headers: { 'x-plant-id': 'all_sites' } })).status()).toBe(200);
    await enrolled.dispose(); await partial.dispose();
  }
});

test('SEC-03 only provisioned peers access exact HA peer routes', async () => {
  const peer = await apiRequest.newContext({ baseURL: 'https://localhost:1938', ignoreHTTPSErrors: true });
  try {
    for (const key of ['trier-ha-default-key', 'invalid', process.env.TRIER_RETIRED_HA_KEY].filter(Boolean)) {
      expect((await peer.get('/api/ha/health', { headers: { 'x-sync-key': key } })).status()).toBe(403);
    }
    if (!process.env.HA_SYNC_KEY) throw new Error('Requires a disposable provisioned HA peer');
    const headers = { 'x-sync-key': process.env.HA_SYNC_KEY };
    expect((await peer.get('/api/ha/health', { headers })).status()).toBe(200);
    expect((await peer.get('/api/ha/consistency?plantId=Plant_1', { headers })).status()).toBe(200);
    expect((await peer.post('/api/sync/replicate', { headers: { ...headers, 'x-plant-id': 'examples' }, data: { plantId: 'examples', entries: [] } })).status()).toBe(200);
    expect((await peer.get('/api/ha/status', { headers })).status()).toBe(401);
    expect((await peer.post('/api/ha/promote', { headers, data: {} })).status()).toBe(401);
    expect((await peer.post('/api/auth/login', { data: { username: 'ghost_admin', password: 'Trier3652!' } })).status()).toBe(200);
    expect((await peer.get('/api/ha/status', { headers: { 'x-plant-id': 'all_sites' } })).status()).toBe(200);
  } finally { await peer.dispose(); }
});
