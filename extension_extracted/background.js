// background.js
// Runs in background — handles clicks, messaging, side panel

// When user clicks the extension icon → open side panel
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});

// Listen for messages from content.js and sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // Content script found a job post → store it
    if (message.type === "JOB_URL_DETECTED") {
        chrome.storage.local.set({
            capturedJobUrl: message.url,
            capturedJobTitle: message.title,
            capturedCompany: message.company,
            capturedAt: Date.now(),
        });
        sendResponse({ ok: true });
    }

    // Side panel is asking for the stored URL
    if (message.type === "GET_CURRENT_JOB") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentUrl = tabs[0]?.url ?? "";
            const isLinkedIn = currentUrl.includes("linkedin.com/jobs");

            if (isLinkedIn) {
                // Also grab whatever content.js extracted
                chrome.storage.local.get(
                    ["capturedJobUrl", "capturedJobTitle", "capturedCompany"],
                    (data) => sendResponse({
                        url: data.capturedJobUrl || currentUrl,
                        title: data.capturedJobTitle || "",
                        company: data.capturedCompany || "",
                    })
                );
            } else {
                sendResponse({ url: currentUrl, title: "", company: "" });
            }
        });
        return true; // keep channel open for async
    }
});
