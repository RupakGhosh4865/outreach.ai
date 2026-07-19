// sidepanel.js
const frame = document.getElementById("appFrame");
const loader = document.getElementById("loader");
const banner = document.getElementById("jobBanner");
const bannerT = document.getElementById("bannerTitle");
const bannerC = document.getElementById("bannerCompany");

// Hide loader when iframe finishes loading
frame.addEventListener("load", () => {
    loader.classList.add("hidden");
});

// Get current job URL from background.js
chrome.runtime.sendMessage({ type: "GET_CURRENT_JOB" }, (response) => {
    if (!response) return;

    const isLinkedIn = response.url?.includes("linkedin.com/jobs");

    if (isLinkedIn) {
        // Show the job banner at top
        bannerT.textContent = response.title || "LinkedIn Job Post";
        bannerC.textContent = response.company || "Detecting company...";
        banner.classList.remove("hidden");

        // Wait for iframe to load then send job data into it
        frame.addEventListener("load", () => {
            frame.contentWindow?.postMessage(
                {
                    type: "EXTENSION_JOB_URL",
                    url: response.url,
                    title: response.title,
                    company: response.company,
                },
                "http://localhost:3000"   // update to production URL when deploying
            );
        });
    }
});

// Listen for messages back from your website
window.addEventListener("message", (event) => {
    if (event.origin !== "http://localhost:3000") return; // update to production URL when deploying

    if (event.data?.type === "CAMPAIGN_LAUNCHED") {
        bannerC.textContent = "✅ Campaign launched!";
        bannerC.style.color = "#10b981";
    }

    if (event.data?.type === "SCAN_STARTED") {
        bannerC.textContent = "⚡ Scanning job post...";
    }
});
