import 'dotenv/config';
import OpenAI from 'openai';

/**
 * Single entry point for every LLM call in the server.
 *
 * Two things this buys us over calling the SDK directly at eight call sites:
 *  - Structured output. Callers pass a JSON schema and get back a parsed object
 *    that matches it, so no route has to guess whether `JSON.parse` will throw.
 *  - Uniform retries. Rate limits and 5xx are transient; every caller used to
 *    treat them as fatal.
 */

let client = null;

/** Lazily built so a missing key fails at first use with a clear message, not at import. */
function getClient() {
    if (!client) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY is not set — add it to server/.env.');
        client = new OpenAI({ apiKey, timeout: 60000, maxRetries: 0 }); // retries handled below
    }
    return client;
}

/**
 * Model tiers. `fast` carries the high-volume extraction/classification work;
 * `quality` writes the things a human actually reads. Both are env-overridable
 * so models can be upgraded without touching code.
 */
export const MODELS = {
    fast: process.env.OPENAI_MODEL_FAST || 'gpt-4o-mini',
    quality: process.env.OPENAI_MODEL_QUALITY || 'gpt-4o',
};

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A 429 usually means "slow down" and is worth retrying — but OpenAI also
 * returns 429 for `insufficient_quota`, which means the account is out of
 * credit. That will never succeed on retry, so backing off just burns time and
 * buries the real cause under retry noise.
 */
export const isQuotaError = (err) =>
    err?.code === 'insufficient_quota' ||
    err?.error?.type === 'insufficient_quota' ||
    /exceeded your current quota|billing/i.test(err?.message || '');

const isRetryable = (err) => {
    if (isQuotaError(err)) return false;
    return RETRYABLE_STATUS.has(err?.status) || ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(err?.code);
};

async function withRetry(fn, { attempts = 3, label = 'llm' } = {}) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (isQuotaError(err)) {
                console.error(`[LLM:${label}] OpenAI quota exhausted — add credit at platform.openai.com/account/billing. AI features are unavailable until then.`);
                break;
            }
            if (!isRetryable(err) || i === attempts - 1) break;
            const backoff = Math.min(8000, 500 * 2 ** i) + Math.random() * 250;
            console.warn(`[LLM:${label}] attempt ${i + 1} failed (${err.status || err.code || err.message}); retrying in ${Math.round(backoff)}ms`);
            await sleep(backoff);
        }
    }
    throw lastErr;
}

/** Strip markdown fences some models still wrap JSON in. */
function unfence(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed.startsWith('```')) return trimmed;
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

/**
 * Chat completion returning plain text.
 * @returns {Promise<string>}
 */
export async function chatText({
    system,
    user,
    model = MODELS.quality,
    maxTokens = 1024,
    temperature = 0.7,
    label = 'text',
}) {
    const res = await withRetry(() => getClient().chat.completions.create({
        model,
        messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        temperature,
    }), { label });

    return res.choices[0]?.message?.content?.trim() || '';
}

/**
 * Chat completion returning a parsed object.
 *
 * Pass `schema` (a JSON Schema object) to get strict structured output — the model
 * is constrained to that shape, which is what makes the parse safe. Without a
 * schema this falls back to plain JSON mode.
 *
 * @returns {Promise<object>}
 */
export async function chatJson({
    system,
    user,
    schema,
    schemaName = 'result',
    model = MODELS.fast,
    maxTokens = 2048,
    temperature = 0.2,
    label = 'json',
}) {
    const responseFormat = schema
        ? { type: 'json_schema', json_schema: { name: schemaName, schema, strict: true } }
        : { type: 'json_object' };

    const run = (format) => getClient().chat.completions.create({
        model,
        messages: [
            { role: 'system', content: system || 'You return only valid JSON matching the requested shape.' },
            { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        temperature,
        response_format: format,
    });

    let res;
    try {
        res = await withRetry(() => run(responseFormat), { label });
    } catch (err) {
        // Older/alternate models may reject json_schema; degrade rather than fail.
        if (schema && (err?.status === 400 || err?.status === 404)) {
            console.warn(`[LLM:${label}] structured output rejected, falling back to json_object`);
            res = await withRetry(() => run({ type: 'json_object' }), { label });
        } else {
            throw err;
        }
    }

    const choice = res.choices[0];
    if (choice?.message?.refusal) throw new Error(`Model refused the request: ${choice.message.refusal}`);

    const raw = unfence(choice?.message?.content);
    if (!raw) throw new Error('Model returned an empty response.');

    try {
        return JSON.parse(raw);
    } catch {
        throw new Error(`Model returned invalid JSON: ${raw.slice(0, 300)}`);
    }
}

/** True when the server is configured to talk to OpenAI at all. */
export const isLlmConfigured = () => Boolean(process.env.OPENAI_API_KEY);
