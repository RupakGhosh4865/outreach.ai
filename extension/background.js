// background.js
// Runs in background — handles icon clicks and cross-script messaging

// When user clicks the extension icon → toggle modal in content script
chrome.action.onClicked.addListener((tab) => {
    if (tab.url?.includes("linkedin.com")) {
        // Try sending a message first
        chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_MODAL" }, (response) => {
            if (chrome.runtime.lastError) {
                console.log("[Background] Content script not found, injecting now...");
                // Not ready? Manually inject it using scripting API
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["content.js"]
                }).then(() => {
                    console.log("[Background] Content script injected successfully!");
                    // Now try sending the message again after a small delay
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_MODAL" });
                    }, 500);
                }).catch(err => {
                    console.error("[Background] Failed to inject content script:", err);
                });
            }
        });
    }
});

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Content script found a job post → store it (optional, content script can now handle modal states directly)
    if (message.type === "JOB_URL_DETECTED") {
        chrome.storage.local.set({
            capturedJobUrl: message.url,
            capturedJobTitle: message.title,
            capturedCompany: message.company,
            capturedAt: Date.now(),
        });
        sendResponse({ ok: true });
    }
    return true; 
});
