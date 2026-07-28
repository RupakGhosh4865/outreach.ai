import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

import JobRequest from '../models/JobRequest.js';
import UserProfile from '../models/UserProfile.js';
import CompanyContact from '../models/CompanyContact.js';
import {
    getOptimizedResumeForJob,
    getCacheEntry,
    optimKey,
    parseResume,
} from '../services/resume.js';
import { buildEmailVariant } from '../services/emailComposer.js';
import {
    attachResume,
    sendToRecipients,
    getTransporterFor,
    senderIdentity,
    loadProfileForSending,
} from '../services/mailer.js';
import { getCompanyDomain, findEmployees, saveCompanyContacts } from '../services/contacts.js';
import { chatJson } from '../services/llm.js';
import { claimDueJobs } from '../services/jobClaim.js';
import { recordApplied, findApplied } from '../services/appliedJobs.js';
import { requireAuth, currentEmail } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.use(requireAuth);

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

// ─── Helpers ────────────────────────────────────────────────────────────────
// Contact discovery (getCompanyDomain / findEmployees / saveCompanyContacts) lives
// in services/contacts.js. This file used to carry a second, drifting copy.

/**
 * Resolve who to credit an application to.
 *
 * Returns null (the account owner) unless the supplied name matches one of the
 * team members the owner registered. Accepting arbitrary strings would let a
 * typo split one person's daily count across two names.
 */
async function resolveApplier(userEmail, appliedBy) {
    const name = String(appliedBy || '').trim();
    if (!name) return null;

    const profile = await UserProfile.findOne({ email: userEmail }).select('teamMembers').lean();
    const match = (profile?.teamMembers || []).find(
        (m) => m.name.toLowerCase() === name.toLowerCase()
    );
    return match ? match.name : null;
}

/** Client-reported wizard start time, ignored if absent, unparseable or in the future. */
function parseStartedAt(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date > new Date()) return null;
    return date;
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

        return await chatJson({
            system: 'You extract contact details from LinkedIn profile text. You never guess an email address that is not written in the text.',
            user: `Raw Text from LinkedIn Profile:
"${rawText.slice(0, 6000)}"

Use an empty string for any field the text does not contain. Format phone as an international number where possible.`,
            schema: {
                type: 'object',
                properties: {
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    email: { type: 'string' },
                    phone: { type: 'string' },
                    position: { type: 'string' },
                },
                required: ['firstName', 'lastName', 'email', 'phone', 'position'],
                additionalProperties: false,
            },
            schemaName: 'linkedin_contact',
            maxTokens: 400,
            label: 'scrape-profile',
        });
    } catch (err) {
        console.error('LinkedIn profile scrape error:', err.message);
        return null;
    }
}

/** Fire a saved JobRequest email (used by the scheduler cron) */
async function fireScheduledJob(jobRecord) {
    try {
        const profile = await loadProfileForSending(jobRecord.userEmail);
        if (!profile) {
            jobRecord.status = 'failed';
            jobRecord.isScheduled = false;
            await jobRecord.save();
            console.error(`[Scheduler] No profile for ${jobRecord.userEmail}; job ${jobRecord._id} failed.`);
            return;
        }

        const transporter = await getTransporterFor(profile);

        const { attachments, body } = attachResume({
            profile,
            body: jobRecord.generatedEmailBody,
            jobTitle: jobRecord.jobTitle,
        });

        const { sentTo } = await sendToRecipients({
            transporter,
            from: senderIdentity(profile, jobRecord.userEmail),
            recipients: (jobRecord.sentTo || []).map((email) => ({ email })),
            subject: jobRecord.generatedEmailSubject,
            body,
            attachments,
        });

        jobRecord.status = sentTo.length > 0 ? 'sent' : 'failed';
        jobRecord.sentAt = new Date();
        jobRecord.isScheduled = false;
        // applyDurationMs was already set when the user scheduled this — measuring
        // to the cron firing would report the wait, not the work.
        await jobRecord.save();

        if (sentTo.length > 0) {
            await recordApplied({
                userEmail: jobRecord.userEmail,
                title: jobRecord.jobTitle,
                company: jobRecord.companyName,
                applyUrl: jobRecord.linkedinUrl,
                appliedBy: jobRecord.appliedBy,
                jobRequestId: jobRecord._id,
            });
        }
        console.log(`[Scheduler] Fired job ${jobRecord._id} → sent to ${sentTo.length} recipient(s)`);
    } catch (err) {
        console.error('[Scheduler] Error firing job:', err.message);
        try {
            jobRecord.status = 'failed';
            jobRecord.isScheduled = false;
            await jobRecord.save();
        } catch (saveErr) {
            console.error('[Scheduler] Could not record failure:', saveErr.message);
        }
    }
}

// ── Scheduled Send Cron ──────────────────────────────────────────────────────
// Jobs are claimed atomically: an unclaimed find() would have every replica send
// the same scheduled email.
export function initScheduledSendService() {
    const schedule = process.env.SCHEDULED_SEND_CRON || '* * * * *';
    cron.schedule(schedule, async () => {
        try {
            const dueJobs = await claimDueJobs({
                model: JobRequest,
                filter: { isScheduled: true, status: 'draft', scheduledAt: { $lte: new Date() } },
                claimField: 'scheduledClaimedAt',
                limit: 25,
            });
            for (const job of dueJobs) {
                console.log(`[Scheduler] Due job found: ${job._id}`);
                await fireScheduledJob(job);
            }
        } catch (err) {
            console.error('[Scheduler] Cron error:', err.message);
        }
    });
    console.log(`📆 Scheduled-send service initialised (schedule: ${schedule})`);
}

/** Generate ONE personalised email variant (links block is added deterministically). */
async function generateSingleVariant(params) {
    return [await buildEmailVariant(params)];
}

/** Shape shared by the URL-extract and autopilot job-parsing calls. */
const JOB_EXTRACT_SCHEMA = {
    type: 'object',
    properties: {
        companyName: { type: 'string' },
        jobTitle: { type: 'string' },
        jobDescription: { type: 'string' },
    },
    required: ['companyName', 'jobTitle', 'jobDescription'],
    additionalProperties: false,
};

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

        // 2. Extract structured data
        const extracted = await chatJson({
            system: 'You extract job details from the raw text of a LinkedIn post or job listing. You never invent a company or title the text does not state.',
            user: `Raw Text from URL:
"${rawText.slice(0, 5000)}"

jobDescription: a concise summary of the role and its requirements, max 1000 characters.
Use an empty string for anything the text does not contain.`,
            schema: JOB_EXTRACT_SCHEMA,
            schemaName: 'job_details',
            maxTokens: 1024,
            label: 'extract-from-url',
        });

        // Also extract any emails shared directly in the post
        const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
        const postEmails = [...new Set(rawText.match(emailRegex) || [])];

        // Save found emails to CompanyContact if company name exists
        if (extracted.companyName && postEmails.length > 0) {
            const tempEmps = postEmails.map(email => ({ email }));
            await saveCompanyContacts(extracted.companyName, null, tempEmps, 'scrape');
        }

        // One job, one application: refuse a posting this account has already
        // applied to. Checked after extraction because the title and company are
        // what identify a job when the URL differs between listings.
        const already = await findApplied(currentEmail(req), {
            title: extracted.jobTitle,
            company: extracted.companyName,
            applyUrl: url,
        });
        if (already) {
            return res.status(409).json({
                alreadyApplied: true,
                appliedAt: already.appliedAt,
                appliedBy: already.appliedBy,
                jobTitle: already.title,
                companyName: already.company,
                message: `You already applied to ${already.title || 'this role'}${already.company ? ` at ${already.company}` : ''} on ${new Date(already.appliedAt).toLocaleDateString()}.`,
            });
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

        // Escape before building the pattern — a company name containing regex
        // metacharacters would otherwise change the query or blow up on parse.
        const escaped = String(companyName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const company = await CompanyContact.findOne({
            companyName: { $regex: new RegExp(`^${escaped}$`, 'i') }
        });

        res.json({ contacts: company?.contacts || [] });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// POST /api/jobs/autopilot
router.post('/autopilot', async (req, res) => {
    try {
        const { url, jobText, emailType, extraContext } = req.body;
        const userEmail = currentEmail(req);
        if (!url && !jobText) return res.status(400).json({ message: 'A job URL or job text is required.' });

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
        
        const job = await chatJson({
            system: 'You extract job details from raw text. You never invent a company or title the text does not state.',
            user: `Raw Text from ${url ? 'URL' : 'User Input'}: "${rawText.slice(0, 5000)}"

jobDescription: a concise summary of the role and its requirements, max 1000 characters.
Use an empty string for anything the text does not contain.`,
            schema: JOB_EXTRACT_SCHEMA,
            schemaName: 'job_details',
            maxTokens: 1024,
            label: 'autopilot-extract',
        });

        // 2b. Stop before doing any work if this posting has already been applied to.
        const alreadyApplied = await findApplied(userEmail, {
            title: job.jobTitle,
            company: job.companyName,
            applyUrl: url,
        });
        if (alreadyApplied) {
            return res.status(409).json({
                alreadyApplied: true,
                appliedAt: alreadyApplied.appliedAt,
                appliedBy: alreadyApplied.appliedBy,
                jobTitle: alreadyApplied.title,
                companyName: alreadyApplied.company,
                message: `You already applied to ${alreadyApplied.title || 'this role'}${alreadyApplied.company ? ` at ${alreadyApplied.company}` : ''} on ${new Date(alreadyApplied.appliedAt).toLocaleDateString()}.`,
            });
        }

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
        let optimizedResumeUsed = null;
        let optimizedMatchScore = null;
        let resumeError = null;

        if (job.jobDescription) {
            console.log('[Autopilot] Starting resume optimization...');
            const optimResult = await getOptimizedResumeForJob(job.jobDescription, profile);
            if (optimResult.ok) {
                resumeText = optimResult.resumeText;
                optimizedResumeUsed = optimResult.source;
                optimizedMatchScore = optimResult.matchScore;
            } else {
                resumeError = optimResult.error;
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
            resumeError,
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
            emailType,
            jobTitle,
            companyName,
            jobDescription,
            extraContext,
            recipientName,
        } = req.body;

        const profile = await UserProfile.findOne({ email: currentEmail(req) });
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
            recipients: bodyRecipients, // [{ name, email }]
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
            appliedBy,    // name of the person applying on the owner's behalf
            applyStartedAt, // ISO datetime the wizard was started, for the timer
            attachCoverLetter, // opt-in: send the tailored cover letter too
        } = req.body;

        const userEmail = currentEmail(req);

        // Only a name the owner has actually registered is accepted, so History's
        // per-person counts can't be skewed by an arbitrary string.
        const applierName = await resolveApplier(userEmail, appliedBy);
        const startedAt = parseStartedAt(applyStartedAt);

        // A manual address is a recipient like any other. Previously it satisfied
        // validation without being added to `recipients`, and the scheduled path
        // then called `recipients.map(...)` on undefined.
        const recipients = [
            ...(Array.isArray(bodyRecipients) ? bodyRecipients : []),
            ...(manualEmail?.trim()
                ? [{ name: 'Recipient', email: manualEmail.trim(), phone: manualPhone?.trim() || '' }]
                : []),
        ].filter((r) => r?.email);

        if (!recipients.length || !subject || !body) {
            return res.status(400).json({ message: 'At least one recipient, a subject and a body are required.' });
        }

        const profile = await loadProfileForSending(userEmail);
        const transporter = await getTransporterFor(profile);

        // ── Optimise Resume ────────────────────────────────────────────────────
        let optimizedPdfPath = null;
        let coverPdfPath = null;
        let optimizedResumeUsed = null;
        let optimizedMatchScore = null;
        let optimizedAddedKeywords = [];
        let optimizedAtsTips = [];
        let resumeError = null;

        if (jobDescription) {
            console.log('[Send] Optimizing resume for job...');
            const optimResult = await getOptimizedResumeForJob(jobDescription, profile);
            if (optimResult.ok) {
                optimizedPdfPath = optimResult.pdfPath;
                optimizedResumeUsed = optimResult.source;
                optimizedMatchScore = optimResult.matchScore;
                optimizedAddedKeywords = optimResult.addedKeywords || [];
                optimizedAtsTips = optimResult.atsTips || [];
                // Opt-in: the cover letter is only attached when the user asked
                // for it on the review step.
                if (attachCoverLetter) coverPdfPath = optimResult.coverPdfPath;
            } else {
                resumeError = optimResult.error;
            }
        }

        // Never promise an attachment we don't have.
        const { attachments, body: outgoingBody, attachmentStatus } = attachResume({
            optimizedPdfPath, coverPdfPath, profile, body, jobTitle,
        });

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
                appliedBy: applierName,
                applyStartedAt: startedAt,
                // Measured now, not when the cron fires: the user's work ends here.
                applyDurationMs: startedAt ? Date.now() - startedAt.getTime() : null,
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

        const { sentTo, errors } = await sendToRecipients({
            transporter,
            from: senderIdentity(profile, userEmail),
            recipients,
            subject,
            body: outgoingBody,
            attachments,
        });

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
            generatedEmailBody: outgoingBody,
            sentTo,
            status: sentTo.length > 0 ? 'sent' : 'failed',
            sentAt: new Date(),
            appliedBy: applierName,
            applyStartedAt: startedAt,
            applyDurationMs: startedAt ? Date.now() - startedAt.getTime() : null,
            optimizedResumeUsed,
            optimizedMatchScore,
            optimizedAddedKeywords,
            optimizedAtsTips,
            // Follow-up scheduling. Only a positive number of days schedules one —
            // a magic -1 used to mean "in 2 minutes", a test hook that shipped.
            followUpDays: followUpDays > 0 ? followUpDays : 0,
            followUpStatus: (followUpDays > 0 && sentTo.length > 0) ? 'pending' : 'none',
            followUpDate: (followUpDays > 0 && sentTo.length > 0)
                ? new Date(Date.now() + followUpDays * 24 * 60 * 60 * 1000)
                : null,
        });
        await jobRecord.save();

        // Record it in the applied-jobs ledger so this posting is filtered out of
        // future scans and blocked if its URL is pasted again.
        if (sentTo.length > 0) {
            await recordApplied({
                userEmail,
                title: jobTitle,
                company: companyName,
                applyUrl: linkedinUrl,
                appliedBy: applierName,
                jobRequestId: jobRecord._id,
            });
        }

        res.json({
            message: attachmentStatus === 'missing'
                ? `Emails sent to ${sentTo.length} recipient(s) — but no resume was attached (none available).`
                : `Emails sent to ${sentTo.length} recipient(s).`,
            sentTo,
            errors,
            jobId: jobRecord._id,
            optimizedResumeUsed,
            optimizedMatchScore,
            attachmentStatus,
            resumeError,
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

        const job = await JobRequest.findOne({ _id: jobId, userEmail: currentEmail(req) });
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

// GET /api/jobs/history?limit=&skip=
router.get('/history', async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 100);
        const skip = Math.max(Number(req.query.skip) || 0, 0);
        const query = { userEmail: currentEmail(req) };

        const [jobs, total] = await Promise.all([
            JobRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
            JobRequest.countDocuments(query),
        ]);
        res.json({ jobs, total, limit, skip });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// Removed Inbox-related routes


// ── Async resume optimization (UI-facing) ───────────────────────────────────

const publicOptimResult = (key, result) => ({
    selectedResume: result.source,
    matchScore: result.matchScore,
    addedKeywords: result.addedKeywords,
    removedKeywords: result.removedKeywords,
    matchedKeywords: result.matchedKeywords,
    missingKeywords: result.missingKeywords,
    gaps: result.gaps,
    atsTips: result.atsTips,
    projectSuggestions: result.projectSuggestions,
    pdfUrl: `/api/jobs/optimize-resume/pdf?key=${key}`,
    coverText: result.coverText,
    coverUrl: result.coverPdfPath ? `/api/jobs/optimize-resume/cover?key=${key}` : null,
    // Present only on the layout-preserving path. Drives the live document
    // preview, which shows the rewrite happening inside the user's own CV.
    layout: result.layout,
    originalLayout: result.originalLayout,
    changes: result.changes,
});

/** Cache entries are per-user; never serve one to a different account. */
function ownedEntry(req, key) {
    const entry = getCacheEntry(key);
    if (!entry) return null;
    return entry.userEmail === currentEmail(req) ? entry : null;
}

// GET /api/jobs/resume-template — this user's derived CV layout
// Lets the optimisation UI render the real document while it is being tailored,
// instead of showing an abstract progress bar over nothing.
router.get('/resume-template', async (req, res) => {
    try {
        const { data } = await axios.get(`${process.env.RESUME_OPTIMIZER_URL || 'http://localhost:8002'}/api/template`, {
            params: { user_email: currentEmail(req) },
            timeout: 15000,
        });
        res.json(data);
    } catch (err) {
        // No template is an ordinary state (legacy uploads) — the panel simply
        // falls back to a plain progress card.
        const status = err?.response?.status === 404 ? 404 : 502;
        res.status(status).json({ message: 'No resume template available.' });
    }
});

// PUT /api/jobs/resume-template — save user edits to the base CV
router.put('/resume-template', async (req, res) => {
    try {
        const { data } = await axios.put(
            `${process.env.RESUME_OPTIMIZER_URL || 'http://localhost:8002'}/api/template`,
            { user_email: currentEmail(req), layout: req.body?.layout },
            { timeout: 20000 },
        );
        res.json(data);
    } catch (err) {
        const status = err?.response?.status === 404 ? 404 : 502;
        res.status(status).json({ message: err?.response?.data?.detail || 'Could not save the CV edits.' });
    }
});

// POST /api/jobs/optimize-resume — kick off (or reuse) optimization for a JD
router.post('/optimize-resume', async (req, res) => {
    const { jobDescription } = req.body;
    if (!jobDescription?.trim()) return res.status(400).json({ message: 'jobDescription is required.' });

    const profile = await UserProfile.findOne({ email: currentEmail(req) });
    const key = optimKey(jobDescription, profile?.email);
    const entry = getCacheEntry(key);
    if (entry?.status === 'done' && entry.result) {
        return res.json({ key, status: 'done', result: publicOptimResult(key, entry.result) });
    }
    if (!entry || entry.status === 'failed') {
        getOptimizedResumeForJob(jobDescription, profile); // resolves into the cache
    }
    res.status(202).json({ key, status: 'pending' });
});

// GET /api/jobs/optimize-resume/status?key=
router.get('/optimize-resume/status', (req, res) => {
    const entry = ownedEntry(req, req.query.key);
    if (!entry) return res.status(404).json({ status: 'unknown' });
    if (entry.status === 'done' && entry.result) {
        return res.json({
            status: 'done',
            percent: 100,
            stage: 'done',
            stageLabel: 'Ready',
            result: publicOptimResult(req.query.key, entry.result),
        });
    }
    res.json({
        status: entry.status,
        stage: entry.stage,
        stageLabel: entry.stageLabel,
        percent: entry.percent,
        error: entry.error || undefined,
    });
});

// GET /api/jobs/optimize-resume/pdf?key= — inline preview / download
router.get('/optimize-resume/pdf', (req, res) => {
    const entry = ownedEntry(req, req.query.key);
    const pdfPath = entry?.result?.pdfPath;
    if (entry?.status !== 'done' || !pdfPath || !fs.existsSync(pdfPath)) {
        return res.status(404).json({ message: 'Optimized PDF not available.' });
    }
    res.setHeader('Content-Disposition', 'inline; filename="Optimized_Resume.pdf"');
    res.sendFile(pdfPath);
});

// GET /api/jobs/optimize-resume/cover?key= — the tailored cover letter PDF
router.get('/optimize-resume/cover', (req, res) => {
    const entry = ownedEntry(req, req.query.key);
    const coverPath = entry?.result?.coverPdfPath;
    if (entry?.status !== 'done' || !coverPath || !fs.existsSync(coverPath)) {
        return res.status(404).json({ message: 'Cover letter not available.' });
    }
    res.setHeader('Content-Disposition', 'inline; filename="Cover_Letter.pdf"');
    res.sendFile(coverPath);
});

// POST /api/jobs/analyze-fit
router.post('/analyze-fit', async (req, res) => {
    try {
        const { jobDescription } = req.body;
        if (!jobDescription) return res.status(400).json({ message: 'jobDescription is required.' });

        // 1. Fetch user profile
        const profile = await UserProfile.findOne({ email: currentEmail(req) });
        if (!profile) return res.status(404).json({ message: 'Profile not found.' });

        // 2. Parse resumes
        const resumes = { main: '', genai: '', backend: '' };
        if (profile.resumePath) resumes.main = await parseResume(profile.resumePath);
        if (profile.resumeGenaiPath) resumes.genai = await parseResume(profile.resumeGenaiPath);
        if (profile.resumeBackendPath) resumes.backend = await parseResume(profile.resumeBackendPath);

        if (!resumes.main && !resumes.genai && !resumes.backend) {
            return res.status(400).json({ message: 'No resumes found in profile.' });
        }

        // 3. ATS scan
        const result = await chatJson({
            system: 'You are an ATS resume analyser. You score honestly and use the full range — a resume aimed at a different domain should score below 40, not 60.',
            user: `Job Description:
${jobDescription.slice(0, 4000)}

--- Main Resume ---
${resumes.main.slice(0, 3000) || "none"}

--- Gen AI Resume ---
${resumes.genai.slice(0, 3000) || "none"}

--- Backend Resume ---
${resumes.backend.slice(0, 3000) || "none"}

Score each resume 0-100 against this job. Score a resume marked "none" as 0.
recommendedResume: whichever of the three scores highest.
advice: 2-4 specific, actionable items ("Missing AWS experience", "Quantify the migration project"), not generic tips.`,
            schema: {
                type: 'object',
                properties: {
                    scores: {
                        type: 'object',
                        properties: {
                            main: { type: 'integer' },
                            genai: { type: 'integer' },
                            backend: { type: 'integer' },
                        },
                        required: ['main', 'genai', 'backend'],
                        additionalProperties: false,
                    },
                    recommendedResume: { type: 'string', enum: ['main', 'genai', 'backend'] },
                    advice: { type: 'array', items: { type: 'string' } },
                },
                required: ['scores', 'recommendedResume', 'advice'],
                additionalProperties: false,
            },
            schemaName: 'ats_fit',
            maxTokens: 800,
            label: 'analyze-fit',
        });

        res.json(result);
    } catch (err) {
        console.error('Analyze fit error:', err.message);
        res.status(500).json({ message: err.message });
    }
});

export default router;
