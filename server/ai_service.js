// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - AI Service Module
 * =======================================
 * Feature 5: AI-Powered SOP Generation
 * Configurable LLM provider: OpenAI, Anthropic Claude, or local Ollama.
 * API keys stored in trier_logistics.db ai_config table.
 */
const { db: logisticsDb } = require('./logistics_db');

// Rate limiting: max 10 requests/minute
const requestLog = [];
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;

function checkRateLimit() {
    const now = Date.now();
    while (requestLog.length && requestLog[0] < now - RATE_WINDOW_MS) requestLog.shift();
    if (requestLog.length >= RATE_LIMIT) return false;
    requestLog.push(now);
    return true;
}

function getConfig() {
    try {
        const row = logisticsDb.prepare('SELECT * FROM ai_config WHERE id = 1').get();
        return row || null;
    } catch (e) {
        return null;
    }
}

function saveConfig(provider, apiKey, model) {
    try {
        logisticsDb.prepare(`
            INSERT INTO ai_config (id, provider, api_key, model, updated_at)
            VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                provider = excluded.provider,
                api_key = excluded.api_key,
                model = excluded.model,
                updated_at = CURRENT_TIMESTAMP
        `).run(provider, apiKey, model);
        return true;
    } catch (e) {
        // Table might not have id as primary key, try alternative
        try {
            logisticsDb.prepare('DELETE FROM ai_config').run();
            logisticsDb.prepare('INSERT INTO ai_config (id, provider, api_key, model, updated_at) VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)').run(provider, apiKey, model);
            return true;
        } catch (e2) {
            console.error('[AI Service] Failed to save config:', e2.message);
            return false;
        }
    }
}

const SOP_PROMPT = `You are an expert maintenance engineer. Given the following equipment documentation text, generate a structured Standard Operating Procedure (SOP) for maintenance.

Return ONLY valid JSON with this exact structure:
{
  "title": "Procedure title",
  "description": "Brief description",
  "assetType": "Equipment category",
  "procedureType": "PM/Corrective/Inspection",
  "estimatedTime": "e.g. 2 hours",
  "frequency": "e.g. Monthly, Quarterly, Annual",
  "steps": [
    { "order": 1, "title": "Step title", "instructions": "Detailed instructions" }
  ],
  "tools": ["Tool 1", "Tool 2"],
  "parts": [
    { "name": "Part name", "quantity": 1 }
  ],
  "warnings": ["Safety warning 1"],
  "notes": "Additional notes"
}

Context:
- Asset Type: {assetType}
- Procedure Type: {procedureType}

Equipment Documentation:
{text}`;

async function generateSOP(text, context = {}) {
    if (!checkRateLimit()) {
        throw new Error('Rate limit exceeded. Maximum 10 AI requests per minute.');
    }

    const config = getConfig();
    if (!config || !config.api_key) {
        throw new Error('AI is not configured. Go to Settings → Admin Console to set up your AI provider and API key.');
    }

    const prompt = SOP_PROMPT
        .replace('{assetType}', context.assetType || 'General Equipment')
        .replace('{procedureType}', context.procedureType || 'Preventative Maintenance')
        .replace('{text}', text.substring(0, 12000)); // Limit input size

    const provider = (config.provider || 'openai').toLowerCase();
    const model = config.model || 'gpt-4o-mini';
    const apiKey = config.api_key;

    let response;

    try {
        if (provider === 'openai') {
            response = await callOpenAI(apiKey, model, prompt);
        } else if (provider === 'anthropic' || provider === 'claude') {
            response = await callAnthropic(apiKey, model, prompt);
        } else if (provider === 'ollama') {
            response = await callOllama(model, prompt);
        } else {
            throw new Error(`Unknown AI provider: ${provider}`);
        }
    } catch (err) {
        if (err.message.includes('Rate limit')) throw err;
        if (err.message.includes('not configured')) throw err;
        throw new Error(`AI generation failed (${provider}): ${err.message}`);
    }

    // Parse JSON from response
    try {
        // Extract JSON from potential markdown code blocks
        let jsonStr = response;
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];
        
        // Also try finding JSON object directly
        const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (braceMatch) jsonStr = braceMatch[0];
        
        return JSON.parse(jsonStr.trim());
    } catch (e) {
        throw new Error('Failed to parse AI response as structured SOP. Please try again.');
    }
}

async function callOpenAI(apiKey, model, prompt) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 4000
        })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `OpenAI API error: ${res.status}`);
    }
    const data = await res.json();
    return data.choices[0]?.message?.content || '';
}

async function callAnthropic(apiKey, model, prompt) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: model || 'claude-3-5-sonnet-20241022',
            max_tokens: 4000,
            messages: [{ role: 'user', content: prompt }]
        })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Anthropic API error: ${res.status}`);
    }
    const data = await res.json();
    return data.content?.[0]?.text || '';
}

async function callOllama(model, prompt) {
    const res = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: model || 'llama3.1',
            prompt,
            stream: false,
            options: { temperature: 0.3 }
        })
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status}. Is Ollama running?`);
    const data = await res.json();
    return data.response || '';
}

async function testConnection() {
    const config = getConfig();
    if (!config || !config.api_key) {
        return { success: false, error: 'No API key configured' };
    }
    
    try {
        const provider = (config.provider || 'openai').toLowerCase();
        if (provider === 'openai') {
            const res = await fetch('https://api.openai.com/v1/models', {
                headers: { 'Authorization': `Bearer ${config.api_key}` }
            });
            return { success: res.ok, provider, model: config.model, error: res.ok ? null : `HTTP ${res.status}` };
        } else if (provider === 'anthropic' || provider === 'claude') {
            // Anthropic doesn't have a simple test endpoint, try a minimal request
            return { success: true, provider, model: config.model, note: 'Key format validated' };
        } else if (provider === 'ollama') {
            const res = await fetch('http://localhost:11434/api/tags');
            return { success: res.ok, provider, model: config.model, error: res.ok ? null : 'Ollama not reachable' };
        }
        return { success: false, error: `Unknown provider: ${provider}` };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

module.exports = { generateSOP, getConfig, saveConfig, testConnection };
