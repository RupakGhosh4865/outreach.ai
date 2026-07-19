// content.js
// Injected into LinkedIn pages — extracts job details and manages the floating modal

if (window.outreach_script_loaded) {
    console.log("[Outreach] Script already active.");
} else {
    window.outreach_script_loaded = true;
    console.log("[Outreach] Content script initializing...");

    let modalVisible = false;

    function extractJobData() {
        const title = document.querySelector(
            ".job-details-jobs-unified-top-card__job-title h1, " +
            ".jobs-unified-top-card__job-title"
        )?.innerText?.trim() ?? "";

        const company = document.querySelector(
            ".job-details-jobs-unified-top-card__company-name a, " +
            ".jobs-unified-top-card__company-name"
        )?.innerText?.trim() ?? "";

        const description = document.querySelector(
            ".jobs-description__content, " +
            "#job-details"
        )?.innerText?.trim()?.slice(0, 2000) ?? "";

        return { title, company, description, url: window.location.href };
    }

    function createModal() {
    if (document.getElementById("outreach-modal-container")) return;

    const container = document.createElement("div");
    container.id = "outreach-modal-container";
    container.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        width: 440px;
        height: 80vh;
        background: #0a0a0f;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        border: 1px solid rgba(99, 102, 241, 0.3);
        border-radius: 16px;
        z-index: 999999;
        display: none;
        flex-direction: column;
        overflow: hidden;
        font-family: 'Inter', sans-serif;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
        padding: 12px 16px;
        background: rgba(99, 102, 241, 0.1);
        border-bottom: 1px solid rgba(99, 102, 241, 0.2);
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: move;
        user-select: none;
    `;
    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 24px; height: 24px; background: #6366f1; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 14px;">⚡</div>
            <span style="font-weight: 700; color: #fff; font-size: 14px;">Outreach.ai</span>
        </div>
        <button id="close-outreach-modal" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 20px;">&times;</button>
    `;

    const iframe = document.createElement("iframe");
    iframe.id = "outreach-iframe";
    iframe.src = "http://localhost:3000/outreach?source=chrome-extension";
    iframe.style.cssText = `
        flex: 1;
        width: 100%;
        border: none;
    `;

    container.appendChild(header);
    container.appendChild(iframe);
    document.body.appendChild(container);

    // Close button
    document.getElementById("close-outreach-modal").onclick = () => toggleModal(false);

    // Draggable logic
    let isDragging = false, currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0;
    header.onmousedown = (e) => {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        isDragging = true;
    };
    document.onmousemove = (e) => {
        if (!isDragging) return;
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        xOffset = currentX;
        yOffset = currentY;
        container.style.transform = `translate(${currentX}px, ${currentY}px)`;
    };
    document.onmouseup = () => isDragging = false;
}

function toggleModal(force) {
    createModal();
    const container = document.getElementById("outreach-modal-container");
    modalVisible = force !== undefined ? force : !modalVisible;
    container.style.display = modalVisible ? "flex" : "none";

    if (modalVisible) {
        // Send current job data to iframe
        setTimeout(sendJobData, 500);
    }
}

function sendJobData() {
    const data = extractJobData();
    const iframe = document.getElementById("outreach-iframe");
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
            type: "EXTENSION_JOB_URL",
            url: data.url,
            title: data.title,
            company: data.company
        }, "http://localhost:3000");
    }
}

// Watch for URL changes (LinkedIn is a SPA)
let lastUrl = location.href;
new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        onPageChange();
    }
}).observe(document, { subtree: true, childList: true });

function onPageChange() {
    if (!window.location.href.includes("/jobs/view/")) return;

    // Auto-open logic
    const path = window.location.pathname;
    if (sessionStorage.getItem('outreach_auto_opened_' + path)) return;

    setTimeout(() => {
        const data = extractJobData();
        if (data.title || data.company) {
            toggleModal(true);
            sessionStorage.setItem('outreach_auto_opened_' + path, 'true');
        }
    }, 1500);
}

// Listen for messages from background.js (Extension Icon Click)
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TOGGLE_MODAL") toggleModal();
});

// Initial run
onPageChange();
}
