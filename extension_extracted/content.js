// content.js
// Injected into LinkedIn pages — extracts job post details from the DOM

function extractJobData() {
    // LinkedIn job post selectors (update if LinkedIn changes DOM)
    const title = document.querySelector(
        ".job-details-jobs-unified-top-card__job-title h1, " +
        ".jobs-unified-top-card__job-title"
    )?.innerText?.trim() ?? "";

    const company = document.querySelector(
        ".job-details-jobs-unified-top-card__company-name a, " +
        ".jobs-unified-top-card__company-name"
    )?.innerText?.trim() ?? "";

    const location = document.querySelector(
        ".job-details-jobs-unified-top-card__bullet, " +
        ".jobs-unified-top-card__bullet"
    )?.innerText?.trim() ?? "";

    const description = document.querySelector(
        ".jobs-description__content, " +
        "#job-details"
    )?.innerText?.trim()?.slice(0, 2000) ?? "";

    return { title, company, location, description, url: window.location.href };
}

// Watch for URL changes (LinkedIn is a SPA — URL changes without page reload)
let lastUrl = location.href;

new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        onPageChange();
    }
}).observe(document, { subtree: true, childList: true });

function onPageChange() {
    // Only extract on job post pages
    if (!window.location.href.includes("/jobs/view/")) return;

    // Wait for DOM to settle after SPA navigation
    setTimeout(() => {
        const data = extractJobData();
        if (data.title || data.company) {
            chrome.runtime.sendMessage({
                type: "JOB_URL_DETECTED",
                url: data.url,
                title: data.title,
                company: data.company,
                description: data.description,
            });
        }
    }, 1500);
}

// Also run on initial load
onPageChange();

// Add a floating "⚡ Outreach" button directly ON the LinkedIn job post
function injectOutreachButton() {
    if (document.getElementById("outreach-ai-btn")) return;
    if (!window.location.href.includes("/jobs/view/")) return;

    const applyBtn = document.querySelector(
        ".jobs-apply-button, .job-details-jobs-unified-top-card__container--two-pane"
    );
    if (!applyBtn) return;

    const btn = document.createElement("button");
    btn.id = "outreach-ai-btn";
    btn.innerHTML = "⚡ Auto-Outreach";
    btn.style.cssText = `
    background: linear-gradient(135deg, #6366f1, #a855f7);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 24px;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    margin-left: 10px;
    font-family: 'Inter', sans-serif;
    box-shadow: 0 4px 14px rgba(99,102,241,0.4);
    transition: all 0.2s;
    z-index: 9999;
  `;

    btn.onmouseenter = () => btn.style.transform = "translateY(-2px)";
    btn.onmouseleave = () => btn.style.transform = "translateY(0)";

    // Click → open side panel with this job pre-filled
    btn.onclick = () => {
        chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" });
    };

    applyBtn.parentNode?.insertBefore(btn, applyBtn.nextSibling);
}

// Inject button after page loads
setTimeout(injectOutreachButton, 2000);
