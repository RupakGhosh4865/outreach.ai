import axios from 'axios';

/**
 * GitHub as a job source: curated hiring repos whose issues are job posts.
 * Uses the public REST API (60 req/h unauthenticated — we make 2-3).
 */
const HIRING_REPOS = [
    'remoteintech/remote-jobs',        // remote-friendly tech companies (README table)
    'SimplifyJobs/New-Grad-Positions', // new-grad roles (README table)
];

export async function searchGitHub({ role }) {
    const roleWords = role.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const jobs = [];

    for (const repo of HIRING_REPOS) {
        try {
            const { data } = await axios.get(`https://api.github.com/repos/${repo}/readme`, {
                headers: { Accept: 'application/vnd.github.raw+json', 'User-Agent': 'outreach-ai-radar' },
                timeout: 12000,
            });

            // README markdown tables: | [Company](url) | ... role/region ... |
            for (const line of String(data).split('\n')) {
                if (!line.startsWith('|')) continue;
                const lower = line.toLowerCase();
                if (!roleWords.some((w) => lower.includes(w)) && !/uk|united kingdom|europe|worldwide|remote/i.test(line)) continue;
                const linkMatch = line.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
                if (!linkMatch) continue;
                jobs.push({
                    title: role,
                    company: linkMatch[1],
                    location: /uk|united kingdom/i.test(line) ? 'UK' : 'Remote',
                    description: line.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300),
                    applyUrl: linkMatch[2],
                    source: 'github',
                    sourceDetail: repo,
                });
                if (jobs.length >= 25) break;
            }
        } catch (err) {
            console.warn(`[Radar:github] ${repo} failed: ${err.response?.status || err.message}`);
        }
    }

    return jobs;
}
