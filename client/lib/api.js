/**
 * Single place the client talks to the API.
 *
 * Two problems this replaces: the base URL was hardcoded to localhost:5000 in
 * six files (so the client could not be deployed without editing source), and
 * roughly half the fetches omitted the auth header — which only worked because
 * the server did not check it.
 */

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');

export const getToken = () =>
    (typeof window === 'undefined' ? null : localStorage.getItem('authToken'));

export function clearSession() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('authToken');
    localStorage.removeItem('jobreach_email');
}

/** Thrown for any non-2xx response, carrying the server's message and status. */
export class ApiError extends Error {
    /**
     * `data` is the parsed error body. Some failures are structured rather than
     * fatal — an already-applied 409 carries the date and who applied — and the
     * UI needs those fields, not just the message.
     */
    constructor(status, message, data = {}) {
        super(message);
        this.status = status;
        this.data = data;
    }
}

/**
 * Authenticated fetch.
 *
 * Pass `body` as a plain object for JSON, or a FormData instance for uploads
 * (the Content-Type is then left to the browser so the boundary is correct).
 */
export async function apiFetch(path, { method = 'GET', body, headers = {}, ...rest } = {}) {
    const token = getToken();
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            ...(isForm || body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...headers,
        },
        ...(body === undefined ? {} : { body: isForm ? body : JSON.stringify(body) }),
        ...rest,
    });

    // An expired or revoked token should land the user on /login rather than
    // leaving a signed-in-looking UI that fails every request.
    if (res.status === 401 && typeof window !== 'undefined') {
        clearSession();
        if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
        throw new ApiError(401, 'Your session expired. Please sign in again.');
    }

    const text = await res.text();
    const data = text ? (() => { try { return JSON.parse(text); } catch { return { message: text }; } })() : {};

    if (!res.ok) throw new ApiError(res.status, data.message || `Request failed (${res.status})`, data);
    return data;
}

export const apiGet = (path, options) => apiFetch(path, { ...options, method: 'GET' });
export const apiPost = (path, body, options) => apiFetch(path, { ...options, method: 'POST', body });
export const apiDelete = (path, options) => apiFetch(path, { ...options, method: 'DELETE' });

/** Absolute URL for endpoints that don't require auth (OAuth entry points). */
export const apiUrl = (path) => `${API_BASE}${path}`;

/**
 * Fetch a protected file and hand back a blob URL.
 *
 * A plain `<a href>` or `<iframe src>` cannot send an Authorization header, so
 * linking straight at an authenticated endpoint returns 401. Fetching it here
 * keeps the header — and keeps the token out of the URL, where it would end up
 * in browser history and server logs.
 *
 * Caller must revoke the returned URL when finished.
 */
async function fetchBlobUrl(path) {
    const token = getToken();
    const res = await fetch(`${API_BASE}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (res.status === 401 && typeof window !== 'undefined') {
        clearSession();
        window.location.href = '/login';
        throw new ApiError(401, 'Your session expired. Please sign in again.');
    }
    if (!res.ok) {
        // Error responses are JSON even on a file route.
        let message = `Could not load the file (${res.status})`;
        try { message = (await res.json()).message || message; } catch { /* keep default */ }
        throw new ApiError(res.status, message);
    }

    return URL.createObjectURL(await res.blob());
}

/** Save a protected file to disk under `filename`. */
export async function downloadAuthedFile(path, filename) {
    const url = await fetchBlobUrl(path);
    try {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } finally {
        // Give the browser a moment to start the download before releasing it.
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
}

/**
 * Open a protected file in a new tab.
 *
 * Returns false when the popup was blocked (the fetch is async, so the click
 * gesture may no longer be trusted) — callers can then offer a download instead.
 */
export async function openAuthedFile(path) {
    const url = await fetchBlobUrl(path);
    const win = window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return Boolean(win);
}
