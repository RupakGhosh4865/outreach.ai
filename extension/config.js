/**
 * Where the extension finds the web app.
 *
 * This was hardcoded to localhost in three files, so a packaged extension could
 * only ever talk to a developer's machine. Override it at runtime from the
 * extension's storage — no rebuild needed to point at production.
 */
const DEFAULT_APP_URL = 'http://localhost:3000';

/** Resolve the app URL, preferring a value saved in chrome.storage. */
async function getAppUrl() {
    try {
        const { appUrl } = await chrome.storage.local.get('appUrl');
        return (appUrl || DEFAULT_APP_URL).replace(/\/$/, '');
    } catch {
        return DEFAULT_APP_URL;
    }
}

/** Persist a new app URL (e.g. from an options page). */
async function setAppUrl(url) {
    await chrome.storage.local.set({ appUrl: String(url).replace(/\/$/, '') });
}

if (typeof self !== 'undefined') {
    self.OutreachConfig = { DEFAULT_APP_URL, getAppUrl, setAppUrl };
}
