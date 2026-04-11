// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */

/**
 * Centralized API client for Trier OS frontend.
 *
 * Solves three problems that existed across 100+ components:
 *   1. Auth headers were constructed differently in every component
 *   2. Many fetch() calls had no .catch() or error handling
 *   3. Plant context (x-plant-id) was sometimes omitted
 *
 * Usage:
 *   import { api } from '../utils/api';
 *
 *   // GET
 *   const data = await api.get('/work-orders?status=Open');
 *
 *   // POST with body
 *   const result = await api.post('/work-orders', { Description: '...', Priority: 'High' });
 *
 *   // PUT
 *   await api.put('/work-orders/42', { StatusID: 3 });
 *
 *   // DELETE
 *   await api.delete('/parts/17');
 *
 *   // FormData upload (no Content-Type override — browser sets multipart boundary)
 *   const fd = new FormData();
 *   fd.append('file', file);
 *   const result = await api.upload('/attachments', fd);
 *
 * All methods throw on HTTP errors (status >= 400) or network failures.
 * Callers should wrap in try/catch and show user-facing error messages.
 */

function getHeaders(extra = {}) {
    return {
        'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
        'Content-Type': 'application/json',
        ...extra,
    };
}

async function request(path, options = {}) {
    const url = `/api${path}`;
    let res;
    try {
        res = await fetch(url, {
            ...options,
            credentials: 'include',
            headers: getHeaders(options.headers),
        });
    } catch (networkErr) {
        throw new Error(`Network error reaching ${url}: ${networkErr.message}`);
    }

    if (!res.ok) {
        let msg = `${res.status} ${res.statusText}`;
        try {
            const body = await res.json();
            if (body.error) msg = body.error;
        } catch { /* ignore */ }
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
}

export const api = {
    /** GET /api{path} */
    get: (path) => request(path, { method: 'GET' }),

    /** POST /api{path} with JSON body */
    post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),

    /** PUT /api{path} with JSON body */
    put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),

    /** DELETE /api{path} */
    delete: (path) => request(path, { method: 'DELETE' }),

    /** POST /api{path} with FormData (file upload — does NOT set Content-Type so browser sets multipart boundary) */
    upload: (path, formData) => request(path, {
        method: 'POST',
        body: formData,
        headers: {
            'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
            // NO Content-Type — browser must set the multipart boundary automatically
        },
    }),

    /** Raw fetch with full header defaults — for cases needing custom options */
    raw: (path, options = {}) => request(path, options),
};

export default api;
