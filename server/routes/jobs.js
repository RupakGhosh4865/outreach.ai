import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Groq from "groq-sdk";
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import cron from 'node-cron';

import JobRequest from '../models/JobRequest.js';
import UserProfile from '../models/UserProfile.js';
import CompanyContact from '../models/CompanyContact.js';
import Reply from '../models/Reply.js';
// import { checkForNewReplies } from '../services/replyTrackingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Tmp directory for optimised resumes ─────────────────────────────────────
const TMP_RESUME_DIR = path.join(__dirname, '..', 'tmp', 'resumes');
if (!fs.existsSync(TMP_RESUME_DIR)) fs.mkdirSync(TMP_RESUME_DIR, { recursive: true });

const RESUME_OPTIMIZER_URL = process.env.RESUME_OPTIMIZER_URL || 'http://localhost:8002';

const router = express.Router();

// Helper to scrape basic text from a URL (e.g., LinkedIn post)
async function fetchUrlContent(url) {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            },
            timeout: 8000
        });
        const $ = cheerio.load(data);

        // Remove script and style elements
        $('script, style').remove();

        // Try to get the main content (LinkedIn posts are tricky, so we get the text from <body>)
        return $('body').text().replace(/\s+/g, ' ').trim();
    } catch (err) {
        console.error('Scrape error:', err.message);
        throw new Error('Could not fetch URL content. Make sure the link is public.');
    }
}

// Gemini client — initialised lazily so missing key doesn't crash at startup
// Groq client initialization
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extract domain from company name using Hunter.io domain search */
async function getCompanyDomain(companyName) {
    try {
        const { data } = await axios.get('https://api.hunter.io/v2/domain-search', {
            params: {
                company: companyName,
                api_key: process.env.HUNTER_API_KEY,
                limit: 1,
            },
            timeout: 10000,
        });
        return data?.data?.domain || null;
    } catch {
        return null;
    }
}

/** Find up to 10 employees with emails via Hunter.io */
async function findEmployees(domain) {
    try {
        const { data } = await axios.get('https://api.hunter.io/v2/domain-search', {
            params: {
                domain,
                api_key: process.env.HUNTER_API_KEY,
                limit: 10,
                type: 'personal',
            },
            timeout: 10000,
        });
        const emails = (data?.data?.emails || []).slice(0, 10);
        return emails.map((e) => ({
            firstName: e.first_name || '',
            lastName: e.last_name || '',
            email: e.value,
            position: e.position || '',
            linkedinUrl: e.linkedin || '',
        }));
    } catch (err) {
        console.error('Hunter.io error:', err.message);
        return [];
    }
}

/** Scrape LinkedIn job post (best-effort, public posts) */
async function scrapeLinkedInJob(url) {
    try {
        const { data: html } = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                    '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                Accept:
                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            },
        });
        const $ = cheerio.load(html);

        const jobTitle =
            $('h1.top-card-layout__title').text().trim() ||
            $('h1').first().text().trim() ||
            '';

        const companyName =
            $('a.topcard__org-name-link').text().trim() ||
            $('span.topcard__flavor a').text().trim() ||
            $('[data-tracking-control-name="public_jobs_topcard-org-name"]').text().trim() ||
            '';

        const description = $('.show-more-less-html__markup').text().trim() ||
            $('.description__text').text().trim() ||
            '';

        return { jobTitle, companyName, description: description.slice(0, 3000) };
    } catch (err) {
        console.error('LinkedIn scrape error:', err.message);
        return { jobTitle: '', companyName: '', description: '' };
    }
}

/** Scrape LinkedIn profile (best-effort, public profiles) */
async function scrapeLinkedInProfile(url) {
    try {
        const { data: html } = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            },
        });
        const $ = cheerio.load(html);
        const rawText = $('body').text().replace(/\s+/g, ' ').trim();

        const systemPrompt = "You are a specialized contact data extractor. Extract personal details from the provided LinkedIn profile text.";
        const userPrompt = `Raw Text from LinkedIn Profile:
"${rawText.slice(0, 6000)}"

TASK:
Extract the following fields in valid JSON format:
{
  "firstName": "...",
  "lastName": "...",
  "email": "...",
  "phone": "...",
  "position": "..."
}

Rules:
- If a field is not found, use an empty string.
- Phone should be formatted as a standard international number if possible.
- ONLY return the JSON object, nothing else.`;

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
        });

        return JSON.parse(completion.choices[0].message.content);
    } catch (err) {
        console.error('LinkedIn profile scrape error:', err.message);
        return null;
    }
}

/** Parse resume text from PDF */
async function parseResume(resumePath) {
    try {
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        const pdfParse = require('pdf-parse');
        const buffer = fs.readFileSync(resumePath);
        const parsed = await pdfParse(buffer);
        return parsed.text.slice(0, 4000);
    } catch {
        return '';
    }
}

/**
 * Call the Python Resume Optimizer, pick the best-matching resume,
 * compile it to PDF, save it to /tmp/resumes/, and return metadata.
 *
 * @returns {{ pdfPath: string, resumeText: string, selectedResume: string, matchScore: number } | null}
 */
// ── Optimization cache: coalesces concurrent calls and lets the UI reuse
// results computed by autopilot/send (and vice versa) for the same JD.
const optimCache = new Map(); // jdHash -> { status, promise, result, error, createdAt }
const OPTIM_TTL_MS = 30 * 60 * 1000;
const jdHash = (jd) => crypto.createHash('sha256').update(jd.trim().toLowerCase()).digest('hex').slice(0, 16);

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of optimCache) {
        if (now - entry.createdAt > OPTIM_TTL_MS) {
            if (entry.result?.pdfPath) {
                try { fs.unlinkSync(entry.result.pdfPath); } catch { /* non-fatal */ }
            }
            optimCache.delete(key);
        }
    }
}, 5 * 60 * 1000).unref();

async function getOptimizedResumeForJob(jobDescription) {
    const key = jdHash(jobDescription);
    const cached = optimCache.get(key);
    if (cached) {
        if (cached.status === 'pending') return cached.promise;
        if (cached.status === 'done' && Date.now() - cached.createdAt < OPTIM_TTL_MS
            && cached.result?.pdfPath && fs.existsSync(cached.result.pdfPath)) {
            return cached.result;
        }
        optimCache.delete(key);
    }

    const entry = { status: 'pending', promise: null, result: null, error: null, createdAt: Date.now() };
    entry.promise = doOptimizeResume(jobDescription).then((result) => {
        entry.status = result ? 'done' : 'failed';
        entry.result = result;
        if (!result) entry.error = 'Optimization failed';
        return result;
    });
    optimCache.set(key, entry);
    return entry.promise;
}

async function doOptimizeResume(jobDescription) {
    try {
        // 1. Ask the optimizer to score & rewrite both resumes
        const optimizeRes = await axios.post(
            `${RESUME_OPTIMIZER_URL}/api/optimize-for-job`,
            { job_description: jobDescription },
            { timeout: 90000 } // LaTeX inference can take up to 90s
        );
        const data = optimizeRes.data;

        // 2. Pick the higher-scoring resume
        const genaiScore = data?.resume_genai?.match_score ?? 0;
        const backendScore = data?.resume_backend?.match_score ?? 0;
        const selectedKey = genaiScore >= backendScore ? 'resume_genai' : 'resume_backend';
        const selectedResume = genaiScore >= backendScore ? 'genai' : 'backend';
        const matchScore = Math.max(genaiScore, backendScore);
        const latexCode = data[selectedKey]?.optimized_resume_latex;

        if (!latexCode) throw new Error('No LaTeX returned from optimizer');

        // 3. Compile LaTeX → PDF via the optimizer's compile endpoint
        const compileRes = await axios.post(
            `${RESUME_OPTIMIZER_URL}/api/compile-pdf`,
            { latex_code: latexCode },
            { responseType: 'arraybuffer', timeout: 30000 }
        );

        // 4. Save to tmp
        const pdfFilename = `optimized_${selectedResume}_${Date.now()}.pdf`;
        const pdfPath = path.join(TMP_RESUME_DIR, pdfFilename);
        fs.writeFileSync(pdfPath, Buffer.from(compileRes.data));

        // 5. Also extract text for prompt enrichment
        let resumeText = '';
        try {
            const { createRequire } = await import('module');
            const require = createRequire(import.meta.url);
            const pdfParse = require('pdf-parse');
            const parsed = await pdfParse(fs.readFileSync(pdfPath));
            resumeText = parsed.text.slice(0, 4000);
        } catch { /* non-fatal */ }

        console.log(`[ResumeOptimizer] Selected: ${selectedResume} (score: ${matchScore}) → ${pdfFilename}`);
        const selected = data[selectedKey] || {};
        return {
            pdfPath,
            resumeText,
            selectedResume,
            matchScore,
            genaiScore,
            backendScore,
            addedKeywords: selected.added_keywords || [],
            removedKeywords: selected.removed_keywords || [],
            atsTips: selected.ats_tips || [],
            projectSuggestions: selected.project_suggestions || [],
        };
    } catch (err) {
        console.error('[ResumeOptimizer] Failed, falling back to profile resume:', err.message);
        return null;
    }
}

/** Fire a saved JobRequest email (used by the scheduler cron) */
async function fireScheduledJob(jobRecord) {
    try {
        const profile = await UserProfile.findOne({ email: jobRecord.userEmail });
        const gmailUser = process.env.GMAIL_USER;
        const gmailPass = process.env.GMAIL_APP_PASSWORD;
        if (!gmailUser || !gmailPass || !profile) return;

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: gmailUser, pass: gmailPass },
        });

        const attachments = [];
        if (profile.resumePath && fs.existsSync(profile.resumePath)) {
            attachments.push({
                filename: profile.resumeOriginalName || 'Resume.pdf',
                path: profile.resumePath,
            });
        }

        const sentTo = [];
        for (const email of jobRecord.sentTo) {
            try {
                await transporter.sendMail({
                    from: `"${profile.name || jobRecord.userEmail}" <${gmailUser}>`,
                    to: email,
                    subject: jobRecord.generatedEmailSubject,
                    text: jobRecord.generatedEmailBody,
                    html: `<div style="font-family:sans-serif;white-space:pre-wrap;line-height:1.6;color:#333;">${jobRecord.generatedEmailBody}</div>`,
                    attachments,
                });
                sentTo.push(email);
            } catch (e) {
                console.error(`[Scheduler] Failed to send to ${email}:`, e.message);
            }
        }

        jobRecord.status = sentTo.length > 0 ? 'sent' : 'failed';
        jobRecord.sentAt = new Date();
        jobRecord.isScheduled = false;
        await jobRecord.save();
        console.log(`[Scheduler] Fired job ${jobRecord._id} → sent to ${sentTo.length} recipient(s)`);
    } catch (err) {
        console.error('[Scheduler] Error firing job:', err.message);
    }
}

// ── Scheduled Send Cron: runs every minute ───────────────────────────────────
cron.schedule('* * * * *', async () => {
    try {
        const now = new Date();
        const dueJobs = await JobRequest.find({
            isScheduled: true,
            status: 'draft',
            scheduledAt: { $lte: now },
        });
        for (const job of dueJobs) {
            console.log(`[Scheduler] Due job found: ${job._id}`);
            await fireScheduledJob(job);
        }
    } catch (err) {
        console.error('[Scheduler] Cron error:', err.message);
    }
});

/** Generate ONE high-quality personalised email variant using Groq (Llama 3.3) */
async function generateSingleVariant({ profile, resumeText, emailType, jobTitle, companyName, jobDescription, recipientName, extraContext }) {
    const typeMap = {
        referral: 'a referral request for a job opening',
        direct_apply: 'a direct job application email',
        vacancy_inquiry: 'an inquiry about potential job vacancies',
    };

    const systemPrompt = "You are a professional career coach and expert at writing high-conversion job outreach emails.";

    const userPrompt = `Context:
- Role: ${jobTitle || 'Not specified'}
- Company: ${companyName || 'Not specified'}
- Recipient: ${recipientName || 'the employee'}
- Email Type: ${typeMap[emailType] || 'outreach'}
- Extra notes: ${extraContext || 'None'}

Sender Profile (Mandatory Links):
- LinkedIn: ${profile?.linkedinUrl || 'Not provided'}
- GitHub: ${profile?.githubUrl || 'Not provided'}
- Portfolio: ${profile?.portfolioUrl || 'Not provided'}
- Resume Link: ${profile?.resumeLink || 'Not provided'}

Sender Background (Context):
- Tech Stack: ${profile?.techStack || 'Not specified'}
- Experience: ${profile?.experienceYears || 0} years and ${profile?.experienceMonths || 0} months
- Target Roles: ${profile?.targetRoles || 'Not specified'}

Job Description (excerpt):
${jobDescription ? jobDescription.slice(0, 1500) : 'Not provided'}

Sender Resume (extracted text):
${resumeText ? resumeText.slice(0, 2000) : 'Not provided'}

TASK:
Write a high-quality, professional, and personalized outreach email. 

STRUCTURE:
1. Short, engaging opening (NO "I hope this email finds you well").
2. Core value proposition: 1-2 sentences on why you are a great fit for the ${jobTitle} role.
3. Proof of Work (Bullet points): Highlight 2 specific achievements from your resume or projects.
4. Professional Links: Integrate GitHub/Portfolio links naturally as evidence of your skills.
5. Call to Action: Clear, respectful request for a chat or referral.
6. Mention that your resume is attached for their review (and mention the resume link if provided).
7. MANDATORY Links Section: Always end the email with a clearly labelled block:
   LinkedIn: [linkedin url]
   GitHub: [github url]
   Portfolio: [portfolio url]
   Resume: [resume link]
   (Only include a link if it was provided. Never omit this section.)

FORMATTING RULES:
- Use clear paragraph breaks (\\n\\n) between sections.
- Use a bulleted list for technical highlights/achievements.
- Tone: Professional, respectful, and confident.
- Length: Max 220 words.

Subject Line Rules:
- Start exactly with "Subject: "
- Make it catchy and relevant to ${jobTitle}.

Rules for Links:
- If GitHub is provided, mention specific "Open Source contributions" or "Recent Projects".
- If Portfolio is provided, invite them to view your "Case Studies" or "Design System work".
- Do not just list the URLs; weave them into the narrative.
- ALWAYS include the raw URLs at the end in the mandatory links section regardless.`;

    const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        max_tokens: 1024,
    });

    const raw = res.choices[0].message.content;

    const subjectMatch = raw.match(/^Subject:\s*(.+)/im);
    const subject = subjectMatch ? subjectMatch[1].trim() : `${emailType === 'referral' ? 'Referral Request' : 'Application'} – ${jobTitle || companyName} `;
    const body = raw.replace(/^Subject:.+\n?/im, '').trim();

    return [{ subject, body, style: 'standard' }];
}

/** Robustly save contacts to CompanyContact collection (upsert) */
async function saveCompanyContacts(companyName, domain, employees, source) {
    if (!companyName || !employees || employees.length === 0) return;
    try {
        const normalizedName = companyName.trim();
        // Case-insensitive find
        let company = await CompanyContact.findOne({
            companyName: { $regex: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });

        if (!company) {
            company = new CompanyContact({ companyName: normalizedName, companyDomain: domain, contacts: [] });
            console.log(`[Company Storage] Creating new entry for: ${normalizedName}`);
        } else if (domain && !company.companyDomain) {
            company.companyDomain = domain;
        }

        const existingEmails = new Set(company.contacts.map(c => c.email.toLowerCase()));
        const newContacts = employees
            .filter(e => e.email && !existingEmails.has(e.email.toLowerCase()))
            .map(e => ({
                firstName: e.firstName || '',
                lastName: e.lastName || '',
                email: e.email,
                position: e.position || '',
                linkedinUrl: e.linkedinUrl || '',
                source: source || 'manual'
            }));

        if (newContacts.length > 0) {
            company.contacts.push(...newContacts);
            company.updatedAt = new Date();
            await company.save();
            console.log(`[Company Storage] Processed ${normalizedName}: Added ${newContacts.length} new contacts.`);
        } else {
            console.log(`[Company Storage] No new contacts to add for ${normalizedName}.`);
        }
    } catch (err) {
        console.error('[Company Storage] Error saving contacts:', err.message);
    }
}


// ─── Routes ─────────────────────────────────────────────────────────────────

// POST /api/jobs/scrape
router.post('/scrape', async (req, res) => {
    try {
        const { linkedinUrl } = req.body;
        if (!linkedinUrl) return res.status(400).json({ message: 'linkedinUrl is required.' });

        const { jobTitle, companyName, description } = await scrapeLinkedInJob(linkedinUrl);
        res.json({ jobTitle, companyName, description });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/jobs/find-employees
router.post('/find-employees', async (req, res) => {
    try {
        const { companyName, companyDomain } = req.body;
        if (!companyName && !companyDomain) {
            return res.status(400).json({ message: 'companyName or companyDomain is required.' });
        }

        let domain = companyDomain;
        if (!domain) domain = await getCompanyDomain(companyName);
        if (!domain) return res.json({ employees: [], domain: null, message: 'Could not find company domain.' });

        const employees = await findEmployees(domain);

        // Save to CompanyContact (Company-Wise Storage)
        await saveCompanyContacts(companyName, domain, employees, 'hunter');

        res.json({ employees, domain });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/jobs/extract-from-url
router.post('/extract-from-url', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ message: 'URL is required.' });

        console.log('Extracting from URL:', url);

        // 1. Scrape text
        const rawText = await fetchUrlContent(url);

        // 2. Use Groq to extract structured data
        const systemPrompt = "You are a specialized job data extractor. Extract structured information from the provided raw text of a LinkedIn post or job listing.";
        const userPrompt = `Raw Text from URL:
"${rawText.slice(0, 5000)}"

TASK:
Extract the following fields in valid JSON format:
{
  "companyName": "...",
  "jobTitle": "...",
  "jobDescription": "..."
}

Rules:
- If a field is not found, use an empty string.
- Job Description should be a concise summary of requirements/role (max 1000 chars).
- ONLY return the JSON object, nothing else.`;

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
            max_tokens: 1024,
        });

        const extracted = JSON.parse(completion.choices[0].message.content);

        // Also extract any emails shared directly in the post
        const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
        const postEmails = [...new Set(rawText.match(emailRegex) || [])];

        // Save found emails to CompanyContact if company name exists
        if (extracted.companyName && postEmails.length > 0) {
            const tempEmps = postEmails.map(email => ({ email }));
            await saveCompanyContacts(extracted.companyName, null, tempEmps, 'scrape');
        }

        console.log('Extracted job details:', extracted, '| Post emails found:', postEmails);
        res.json({ ...extracted, postEmails, message: 'Job details extracted successfully!' });
    } catch (err) {
        console.error('Extraction error:', err);
        res.status(500).json({ message: err.message || 'Error extracting job details.' });
    }
});


// POST /api/jobs/scrape-profile
router.post('/scrape-profile', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ message: 'LinkedIn profile URL is required.' });

        console.log(`[Scraper] Processing profile: ${url}`);
        const data = await scrapeLinkedInProfile(url);

        if (!data) {
            return res.status(500).json({ message: 'Failed to scrape profile. The profile might be private or protected.' });
        }

        // Add to company contacts if email found
        if (data.email) {
            const companyName = data.position?.split(' at ')[1] || 'Individual';
            await saveCompanyContacts(companyName, null, [data], 'scrape');
        }

        res.json({ ...data, message: 'Profile scraped successfully!' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// GET /api/jobs/company-contacts?companyName=xxx
router.get('/company-contacts', async (req, res) => {
    try {
        const { companyName } = req.query;
        if (!companyName) return res.status(400).json({ message: 'companyName is required.' });

        const company = await CompanyContact.findOne({
            companyName: { $regex: new RegExp(`^${companyName}$`, 'i') }
        });

        res.json({ contacts: company?.contacts || [] });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// POST /api/jobs/autopilot
router.post('/autopilot', async (req, res) => {
    try {
        const { url, jobText, userEmail, emailType, extraContext } = req.body;
        if ((!url && !jobText) || !userEmail) return res.status(400).json({ message: 'URL/JobText and userEmail are required.' });

        // 1. Check user & subscription limits
        let profile = await UserProfile.findOne({ email: userEmail });
        if (!profile) return res.status(404).json({ message: 'Profile not found. Please set up your profile first.' });

        const plan = profile.subscription?.plan || 'free';
        // const used = profile.subscription?.campaignsUsed || 0;

        const limits = {
            free: { campaigns: 3, emails: 5 },
            starter: { campaigns: 20, emails: 10 },
            pro: { campaigns: 99999, emails: 15 }, // Unlimited
            team: { campaigns: 99999, emails: 999, seats: 5 }, // Everything + team dashboard
        };

        // ── Monthly limit check disabled temporarily ──
        // if (used >= (limits[plan]?.campaigns || 3)) {
        //     return res.status(403).json({
        //         message: `Monthly campaign limit reached for ${plan} plan.`,
        //         limitReached: true
        //     });
        // }

        console.log(`[Autopilot] Processing ${url} for ${userEmail} (${plan} plan)`);

        // 2. Scraping Job Details
        let rawText = '';
        if (url) {
            rawText = await fetchUrlContent(url);
        } else {
            rawText = jobText;
        }
        
        const systemPrompt = "You are a specialized job data extractor. Extract structured information from the provided raw text.";
        const userPrompt = `Raw Text from ${url ? 'URL' : 'User Input'}: "${rawText.slice(0, 5000)}"\n\nTASK:\nExtract JSON: { "companyName": "...", "jobTitle": "...", "jobDescription": "..." }\n\nRules: Max 1000 chars for description. ONLY return JSON.`;

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
            response_format: { type: "json_object" },
        });
        const job = JSON.parse(completion.choices[0].message.content);

        // 3a. Extract emails directly shared in the LinkedIn post text
        const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
        const foundEmails = rawText.match(emailRegex) || [];
        const postEmployees = [...new Set(foundEmails)].map((email) => ({
            firstName: '',
            lastName: '',
            email,
            position: 'Hiring Manager',
            linkedinUrl: '',
            source: 'post',
        }));

        // 3b. Find Employees via Hunter.io
        let domain = await getCompanyDomain(job.companyName);
        let hunterEmployees = [];
        if (domain) {
            hunterEmployees = await findEmployees(domain);
        }

        // Merge: post emails first (most direct), then Hunter.io
        let employees = [...postEmployees, ...hunterEmployees];

        // Save found contacts to CompanyContact (Company-Wise Storage)
        if (job.companyName) {
            await saveCompanyContacts(job.companyName, domain, employees, 'autopilot');
        }

        // Limit employees based on plan
        const maxEmails = limits[plan]?.emails || 5;
        employees = employees.slice(0, maxEmails);

        // 4. Optimise Resume against the job description (progress tracked client-side)
        let resumeText = '';
        let optimizedPdfPath = null;
        let optimizedResumeUsed = null;
        let optimizedMatchScore = null;

        if (job.jobDescription) {
            console.log('[Autopilot] Starting resume optimization...');
            const optimResult = await getOptimizedResumeForJob(job.jobDescription);
            if (optimResult) {
                resumeText = optimResult.resumeText;
                optimizedPdfPath = optimResult.pdfPath;
                optimizedResumeUsed = optimResult.selectedResume;
                optimizedMatchScore = optimResult.matchScore;
            }
        }
        // fallback to profile resume text if optimization failed
        if (!resumeText && profile.resumePath) {
            resumeText = await parseResume(profile.resumePath);
        }

        // 5. Generate Emails for each employee
        const results = [];
        for (const emp of employees) {
            const params = {
                profile,
                resumeText,
                emailType: emailType || 'referral',
                jobTitle: job.jobTitle,
                companyName: job.companyName,
                jobDescription: job.jobDescription,
                recipientName: emp.firstName || 'there',
                extraContext
            };
            const variants = await generateSingleVariant(params);
            results.push({
                recipient: emp,
                email: variants[0]
            });
        }

        // 6. Increment Usage
        if (!profile.subscription) {
            profile.subscription = { plan: 'free', campaignsUsed: 0, lastResetDate: new Date() };
        }
        profile.subscription.campaignsUsed += 1;
        await profile.save();

        res.json({
            job,
            results,
            campaignsUsed: profile.subscription.campaignsUsed,
            optimizedResumeUsed,
            optimizedMatchScore,
            message: 'Autopilot campaign prepared successfully!'
        });

    } catch (err) {
        console.error('Autopilot error:', err);
        res.status(500).json({ message: err.message || 'Error running autopilot.' });
    }
});

// POST /api/jobs/generate-email
router.post('/generate-email', async (req, res) => {
    try {
        const {
            userEmail,
            emailType,
            jobTitle,
            companyName,
            jobDescription,
            extraContext,
            recipientName,
        } = req.body;

        if (!userEmail) return res.status(400).json({ message: 'userEmail is required.' });

        const profile = await UserProfile.findOne({ email: userEmail });
        let resumeText = '';
        if (profile?.resumePath) {
            resumeText = await parseResume(profile.resumePath);
        }

        const params = { profile, resumeText, emailType, jobTitle, companyName, jobDescription, recipientName, extraContext };

        const variants = await generateSingleVariant(params);
        res.json({ variants });
    } catch (err) {
        console.error('Generate email error:', err);
        res.status(500).json({ message: err.message });
    }
});


// POST /api/jobs/send
router.post('/send', async (req, res) => {
    try {
        const {
            userEmail,
            recipients, // [{ name, email }]
            subject,
            body,
            linkedinUrl,
            companyName,
            jobTitle,
            jobDescription,
            emailType,
            extraContext,
            manualEmail,
            manualPhone,
            employees,
            followUpDays,
            scheduledAt,  // ISO datetime string — null / undefined = send immediately
        } = req.body;

        if (!userEmail || (!recipients?.length && !manualEmail) || !subject || !body) {
            return res.status(400).json({ message: 'userEmail, recipients, subject, and body are required.' });
        }

        const gmailUser = process.env.GMAIL_USER;
        const gmailPass = process.env.GMAIL_APP_PASSWORD;

        if (!gmailUser || !gmailPass) {
            return res.status(500).json({ message: 'Gmail credentials not configured in .env' });
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: gmailUser, pass: gmailPass },
        });

        const profile = await UserProfile.findOne({ email: userEmail });

        // ── Optimise Resume ────────────────────────────────────────────────────
        let optimizedPdfPath = null;
        let optimizedResumeUsed = null;
        let optimizedMatchScore = null;
        let optimizedAddedKeywords = [];
        let optimizedAtsTips = [];

        if (jobDescription) {
            console.log('[Send] Optimizing resume for job...');
            const optimResult = await getOptimizedResumeForJob(jobDescription);
            if (optimResult) {
                optimizedPdfPath = optimResult.pdfPath;
                optimizedResumeUsed = optimResult.selectedResume;
                optimizedMatchScore = optimResult.matchScore;
                optimizedAddedKeywords = optimResult.addedKeywords || [];
                optimizedAtsTips = optimResult.atsTips || [];
            }
        }

        const attachments = [];
        if (optimizedPdfPath && fs.existsSync(optimizedPdfPath)) {
            // Use the freshly optimised resume PDF
            attachments.push({
                filename: `Optimized_Resume_${jobTitle || 'Application'}.pdf`,
                path: optimizedPdfPath,
            });
        } else if (profile?.resumePath && fs.existsSync(profile.resumePath)) {
            // Fallback to the profile's stored resume
            attachments.push({
                filename: profile.resumeOriginalName || 'Resume.pdf',
                path: profile.resumePath,
            });
        }

        // ── Scheduled Send ────────────────────────────────────────────────────
        const sendScheduled = scheduledAt && new Date(scheduledAt) > new Date();
        if (sendScheduled) {
            // Save record for the cron job to fire later; don't send now
            const jobRecord = new JobRequest({
                userEmail,
                linkedinUrl: linkedinUrl || '',
                companyName: companyName || '',
                jobTitle: jobTitle || '',
                jobDescription: jobDescription || '',
                emailType: emailType || 'referral',
                extraContext: extraContext || '',
                manualEmail: manualEmail || '',
                manualPhone: manualPhone || '',
                employees: employees || [],
                generatedEmailSubject: subject,
                generatedEmailBody: body,
                sentTo: recipients.map(r => r.email),
                status: 'draft',
                scheduledAt: new Date(scheduledAt),
                isScheduled: true,
                optimizedResumeUsed,
                optimizedMatchScore,
                optimizedAddedKeywords,
                optimizedAtsTips,
                followUpDays: followUpDays || 0,
                followUpStatus: 'none',
            });
            await jobRecord.save();
            return res.json({
                message: `✅ Email scheduled for ${new Date(scheduledAt).toLocaleString()}.`,
                scheduled: true,
                jobId: jobRecord._id,
                optimizedResumeUsed,
                optimizedMatchScore,
            });
        }

        const sentTo = [];
        const errors = [];

        for (const recipient of recipients) {
            try {
                await transporter.sendMail({
                    from: `"${profile?.name || userEmail}" <${gmailUser}>`,
                    to: recipient.email,
                    subject,
                    text: body,
                    html: `<div style="font-family:sans-serif;white-space:pre-wrap;line-height:1.6;color:#333;">${body}</div>`,
                    attachments,
                });
                sentTo.push(recipient.email);
            } catch (emailErr) {
                errors.push({ email: recipient.email, error: emailErr.message });
            }
        }

        // Optimized PDF cleanup is owned by the optimCache TTL sweep so the
        // preview/download URL keeps working after sending.

        // Save to DB
        const jobRecord = new JobRequest({
            userEmail,
            linkedinUrl: linkedinUrl || '',
            companyName: companyName || '',
            jobTitle: jobTitle || '',
            jobDescription: jobDescription || '',
            emailType: emailType || 'referral',
            extraContext: extraContext || '',
            manualEmail: manualEmail || '',
            manualPhone: manualPhone || '',
            employees: employees || [],
            generatedEmailSubject: subject,
            generatedEmailBody: body,
            sentTo,
            status: sentTo.length > 0 ? 'sent' : 'failed',
            sentAt: new Date(),
            optimizedResumeUsed,
            optimizedMatchScore,
            optimizedAddedKeywords,
            optimizedAtsTips,
            // Follow-up scheduling
            followUpDays: followUpDays || 0,
            followUpStatus: (followUpDays !== 0 && sentTo.length > 0) ? 'pending' : 'none',
            followUpDate: (followUpDays !== 0 && sentTo.length > 0)
                ? (followUpDays === -1
                    ? new Date(Date.now() + 2 * 60 * 1000) // 2 minutes for testing
                    : new Date(Date.now() + followUpDays * 24 * 60 * 60 * 1000))
                : null,
        });
        await jobRecord.save();

        res.json({
            message: `Emails sent to ${sentTo.length} recipient(s).`,
            sentTo,
            errors,
            jobId: jobRecord._id,
            optimizedResumeUsed,
            optimizedMatchScore,
        });
    } catch (err) {
        console.error('Send email error:', err);
        res.status(500).json({ message: err.message });
    }
});

// POST /api/jobs/schedule — update scheduledAt for a saved job
router.post('/schedule', async (req, res) => {
    try {
        const { jobId, scheduledAt } = req.body;
        if (!jobId || !scheduledAt) return res.status(400).json({ message: 'jobId and scheduledAt are required.' });

        const job = await JobRequest.findById(jobId);
        if (!job) return res.status(404).json({ message: 'Job not found.' });

        job.scheduledAt = new Date(scheduledAt);
        job.isScheduled = true;
        job.status = 'draft';
        await job.save();

        res.json({ message: `Scheduled for ${new Date(scheduledAt).toLocaleString()}`, jobId });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/jobs/history?userEmail=xxx
router.get('/history', async (req, res) => {
    try {
        const { userEmail } = req.query;
        if (!userEmail) return res.status(400).json({ message: 'userEmail is required.' });
        const jobs = await JobRequest.find({ userEmail }).sort({ createdAt: -1 }).limit(50);
        res.json({ jobs });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// Removed Inbox-related routes


// ── Async resume optimization (UI-facing) ───────────────────────────────────

const publicOptimResult = (key, result) => ({
    selectedResume: result.selectedResume,
    matchScore: result.matchScore,
    genaiScore: result.genaiScore,
    backendScore: result.backendScore,
    addedKeywords: result.addedKeywords,
    removedKeywords: result.removedKeywords,
    atsTips: result.atsTips,
    projectSuggestions: result.projectSuggestions,
    pdfUrl: `/api/jobs/optimize-resume/pdf?key=${key}`,
});

// POST /api/jobs/optimize-resume — kick off (or reuse) optimization for a JD
router.post('/optimize-resume', (req, res) => {
    const { jobDescription } = req.body;
    if (!jobDescription?.trim()) return res.status(400).json({ message: 'jobDescription is required.' });

    const key = jdHash(jobDescription);
    const entry = optimCache.get(key);
    if (entry?.status === 'done' && entry.result) {
        return res.json({ key, status: 'done', result: publicOptimResult(key, entry.result) });
    }
    if (!entry || entry.status === 'failed') {
        getOptimizedResumeForJob(jobDescription).catch(() => { /* status tracked in cache */ });
    }
    res.status(202).json({ key, status: 'pending' });
});

// GET /api/jobs/optimize-resume/status?key=
router.get('/optimize-resume/status', (req, res) => {
    const entry = optimCache.get(req.query.key);
    if (!entry) return res.status(404).json({ status: 'unknown' });
    if (entry.status === 'done' && entry.result) {
        return res.json({ status: 'done', result: publicOptimResult(req.query.key, entry.result) });
    }
    res.json({ status: entry.status, error: entry.error || undefined });
});

// GET /api/jobs/optimize-resume/pdf?key= — inline preview / download
router.get('/optimize-resume/pdf', (req, res) => {
    const entry = optimCache.get(req.query.key);
    const pdfPath = entry?.result?.pdfPath;
    if (entry?.status !== 'done' || !pdfPath || !fs.existsSync(pdfPath)) {
        return res.status(404).json({ message: 'Optimized PDF not available.' });
    }
    res.setHeader('Content-Disposition', 'inline; filename="Optimized_Resume.pdf"');
    res.sendFile(pdfPath);
});

// POST /api/jobs/analyze-fit
router.post('/analyze-fit', async (req, res) => {
    try {
        const { jobDescription, userEmail } = req.body;
        if (!jobDescription || !userEmail) return res.status(400).json({ message: 'jobDescription and userEmail are required.' });

        // 1. Fetch user profile
        const profile = await UserProfile.findOne({ email: userEmail });
        if (!profile) return res.status(404).json({ message: 'Profile not found.' });

        // 2. Parse resumes
        const resumes = { main: '', genai: '', backend: '' };
        if (profile.resumePath) resumes.main = await parseResume(profile.resumePath);
        if (profile.resumeGenaiPath) resumes.genai = await parseResume(profile.resumeGenaiPath);
        if (profile.resumeBackendPath) resumes.backend = await parseResume(profile.resumeBackendPath);

        if (!resumes.main && !resumes.genai && !resumes.backend) {
            return res.status(400).json({ message: 'No resumes found in profile.' });
        }

        // 3. Prompt Groq for fast ATS scan
        const systemPrompt = "You are an expert ATS Resume Analyzer. Your task is to output a raw JSON object comparing the user's resumes against the job description. Do NOT output markdown. Do NOT output explanations.";
        const userPrompt = `
Job Description:
${jobDescription.slice(0, 4000)}

--- Main Resume ---
${resumes.main.slice(0, 3000) || "none"}

--- Gen AI Resume ---
${resumes.genai.slice(0, 3000) || "none"}

--- Backend Resume ---
${resumes.backend.slice(0, 3000) || "none"}

TASK: Evaluate these resumes against the job. Output a JSON object with this exact structure:
{
  "scores": {
    "main": 65,
    "genai": 85,
    "backend": 40
  },
  "recommendedResume": "genai", // one of: "main", "genai", "backend" (pick the best one)
  "advice": [
    "Skill gap: Missing AWS experience.",
    "Formatting: Include more metrics."
  ]
}
`;

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2,
        });

        const result = JSON.parse(completion.choices[0].message.content);
        res.json(result);
    } catch (err) {
        console.error('Analyze fit error:', err.message);
        res.status(500).json({ message: err.message });
    }
});

export default router;
