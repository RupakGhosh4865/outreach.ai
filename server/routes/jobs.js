import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import Groq from "groq-sdk";
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

import JobRequest from '../models/JobRequest.js';
import UserProfile from '../models/UserProfile.js';
import CompanyContact from '../models/CompanyContact.js';
import Reply from '../models/Reply.js';
// import { checkForNewReplies } from '../services/replyTrackingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

Sender Background (Context):
- Tech Stack: ${profile?.techStack || 'Not specified'}
- Experience: ${profile?.experienceYears ? profile.experienceYears + ' years' : 'Not specified'}
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
6. Mention that your resume is attached for their review.
7. MANDATORY Links Section: Always end the email with a clearly labelled block:
   LinkedIn: [linkedin url]
   GitHub: [github url]
   Portfolio: [portfolio url]
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
        const { url, userEmail, emailType, extraContext } = req.body;
        if (!url || !userEmail) return res.status(400).json({ message: 'url and userEmail are required.' });

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
        const rawText = await fetchUrlContent(url);
        const systemPrompt = "You are a specialized job data extractor. Extract structured information from the provided raw text.";
        const userPrompt = `Raw Text from URL: "${rawText.slice(0, 5000)}"\n\nTASK:\nExtract JSON: { "companyName": "...", "jobTitle": "...", "jobDescription": "..." }\n\nRules: Max 1000 chars for description. ONLY return JSON.`;

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

        // 4. Parse Resume
        let resumeText = '';
        if (profile.resumePath) {
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
        const attachments = [];
        if (profile?.resumePath && fs.existsSync(profile.resumePath)) {
            attachments.push({
                filename: profile.resumeOriginalName || 'Resume.pdf',
                path: profile.resumePath,
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
            sentTo,
            status: sentTo.length > 0 ? 'sent' : 'failed',
            sentAt: new Date(),
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
        });
    } catch (err) {
        console.error('Send email error:', err);
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


export default router;
