import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import JobApplication from '../models/JobApplication.js';
import UserProfile from '../models/UserProfile.js';
import JobRequest from '../models/JobRequest.js';
import { transition, startStep, finishStep, resetStepsFrom } from './applicationFsm.js';
import { buildOptimizedResume, parseResume } from './resume.js';
import { findContactsForCompany } from './contacts.js';
import { buildEmailVariant } from './emailComposer.js';
import { getTransporter, attachResume, sendToRecipients } from './mailer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const GENERATED_CV_DIR = path.join(__dirname, '..', 'uploads', 'generated');
if (!fs.existsSync(GENERATED_CV_DIR)) fs.mkdirSync(GENERATED_CV_DIR, { recursive: true });

const PLAN_LIMITS = {
    free: { campaigns: 3, emails: 5 },
    starter: { campaigns: 20, emails: 10 },
    pro: { campaigns: 99999, emails: 15 },
    team: { campaigns: 99999, emails: 999 },
};

// One run per application at a time — a double-click on Approve must not start two pipelines.
const running = new Map(); // appId -> Promise

class StepError extends Error {
    constructor(step, message) {
        super(message);
        this.step = step;
    }
}

// ── Steps ────────────────────────────────────────────────────────────────────

async function stepGenerateCv(app, profile) {
    await transition(app, 'cv_generating');
    await startStep(app, 'generate_cv');

    const outPath = path.join(GENERATED_CV_DIR, `cv_${app._id}.pdf`);
    const result = await buildOptimizedResume({
        jobDescription: app.jobDescription || app.jobTitle || '',
        profile,
        outPath,
    });

    if (!result.ok) {
        await finishStep(app, 'generate_cv', { error: result.error, patch: { 'cv.error': result.error } });
        await transition(app, 'cv_failed');
        throw new StepError('generate_cv', result.error);
    }

    await finishStep(app, 'generate_cv', {
        patch: {
            cv: {
                pdfPath: result.pdfPath,
                content: result.resume,
                matchScore: result.matchScore,
                atsTips: result.atsTips,
                addedKeywords: result.addedKeywords,
                error: undefined,
            },
        },
    });
    await transition(app, 'cv_generated');
    return result;
}

async function stepFindContacts(app, profile) {
    await startStep(app, 'find_contacts');
    try {
        const limit = PLAN_LIMITS[profile?.subscription?.plan || 'free']?.emails || 5;
        const { contacts, domain } = await findContactsForCompany({
            companyName: app.companyName,
            jobText: app.jobDescription || '',
            limit,
        });

        if (!contacts.length) {
            const message = `No contact emails found for ${app.companyName || 'this company'}. Add a recipient manually to continue.`;
            await finishStep(app, 'find_contacts', { error: message });
            throw new StepError('find_contacts', message);
        }

        await finishStep(app, 'find_contacts', { patch: { contacts, companyDomain: domain } });
        await transition(app, 'contacts_found');
        return contacts;
    } catch (err) {
        if (err instanceof StepError) throw err;
        await finishStep(app, 'find_contacts', { error: err.message });
        throw new StepError('find_contacts', err.message);
    }
}

async function stepGenerateEmail(app, profile, cvResult) {
    await startStep(app, 'generate_email');
    try {
        const hasAttachment = Boolean(
            (app.cv?.pdfPath && fs.existsSync(app.cv.pdfPath)) ||
            (profile?.resumePath && fs.existsSync(profile.resumePath))
        );

        let resumeText = cvResult?.resumeText;
        if (!resumeText && profile?.resumePath) resumeText = await parseResume(profile.resumePath);

        const primary = app.contacts[0] || {};
        const variant = await buildEmailVariant({
            profile,
            resumeText,
            emailType: app.emailType || 'referral',
            jobTitle: app.jobTitle,
            companyName: app.companyName,
            jobDescription: app.jobDescription,
            recipientName: primary.firstName || 'there',
            extraContext: app.extraContext,
            hasAttachment,
        });

        await finishStep(app, 'generate_email', {
            patch: {
                email: {
                    ...(app.email?.toObject?.() || {}),
                    subject: variant.subject,
                    body: variant.body,
                    to: app.contacts.map((c) => c.email),
                },
            },
        });
        await transition(app, 'email_drafted');
        return variant;
    } catch (err) {
        await finishStep(app, 'generate_email', { error: err.message });
        throw new StepError('generate_email', err.message);
    }
}

async function stepSendEmail(app, profile) {
    await transition(app, 'emailing');
    await startStep(app, 'send_email');

    try {
        const plan = profile?.subscription?.plan || 'free';
        const used = profile?.subscription?.campaignsUsed || 0;
        if (used >= (PLAN_LIMITS[plan]?.campaigns || 3)) {
            throw new Error(`Monthly campaign limit reached for the ${plan} plan.`);
        }

        const recipients = app.contacts.filter((c) => c.email);
        if (!recipients.length) throw new Error('No recipients with an email address.');

        const { attachments, body, attachmentStatus } = attachResume({
            optimizedPdfPath: app.cv?.pdfPath,
            profile,
            body: app.email?.body,
            jobTitle: app.jobTitle,
        });

        const { sentTo, errors } = await sendToRecipients({
            transporter: getTransporter(),
            from: `"${profile?.name || app.userEmail}" <${process.env.GMAIL_USER}>`,
            recipients,
            subject: app.email?.subject,
            body,
            attachments,
        });

        if (!sentTo.length) {
            const message = errors[0]?.error || 'All sends failed.';
            await finishStep(app, 'send_email', { error: message });
            await transition(app, 'email_failed');
            throw new StepError('send_email', message);
        }

        await finishStep(app, 'send_email', {
            patch: {
                email: {
                    ...(app.email?.toObject?.() || {}),
                    body,
                    to: sentTo,
                    attachmentStatus,
                    sentAt: new Date(),
                    errors,
                },
            },
        });
        await transition(app, 'emailed');

        // Mirror into JobRequest so the existing history/follow-up features see it.
        await JobRequest.create({
            userEmail: app.userEmail,
            linkedinUrl: app.applyUrl || '',
            companyName: app.companyName || '',
            jobTitle: app.jobTitle || '',
            jobDescription: app.jobDescription || '',
            emailType: app.emailType || 'referral',
            employees: app.contacts,
            generatedEmailSubject: app.email?.subject,
            generatedEmailBody: body,
            sentTo,
            status: 'sent',
            sentAt: new Date(),
            optimizedMatchScore: app.cv?.matchScore,
            optimizedAtsTips: app.cv?.atsTips || [],
            optimizedAddedKeywords: app.cv?.addedKeywords || [],
        });

        if (profile) {
            if (!profile.subscription) profile.subscription = { plan: 'free', campaignsUsed: 0, lastResetDate: new Date() };
            profile.subscription.campaignsUsed += 1;
            await profile.save();
        }

        return { sentTo, errors, attachmentStatus };
    } catch (err) {
        if (err instanceof StepError) throw err;
        await finishStep(app, 'send_email', { error: err.message });
        if (app.status === 'emailing') await transition(app, 'email_failed');
        throw new StepError('send_email', err.message);
    }
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

const STEP_ORDER = ['generate_cv', 'find_contacts', 'generate_email', 'send_email'];

async function execute(appId, fromStep) {
    const app = await JobApplication.findById(appId);
    if (!app) throw new Error('Application not found.');
    const profile = await UserProfile.findOne({ email: app.userEmail });

    const startIndex = STEP_ORDER.indexOf(fromStep);
    const steps = startIndex >= 0 ? STEP_ORDER.slice(startIndex) : STEP_ORDER;

    let cvResult = null;
    try {
        if (steps.includes('generate_cv')) cvResult = await stepGenerateCv(app, profile);
        if (steps.includes('find_contacts')) await stepFindContacts(app, profile);
        if (steps.includes('generate_email')) await stepGenerateEmail(app, profile, cvResult);

        // Pause here unless the user opted into automatic sending.
        if (steps.includes('send_email') && app.autoSend) {
            await stepSendEmail(app, profile);
        }
    } catch (err) {
        console.error(`[Pipeline] ${appId} failed at ${err.step || 'unknown'}: ${err.message}`);
        return { ok: false, step: err.step, error: err.message };
    }

    console.log(`[Pipeline] ${appId} finished at status "${app.status}".`);
    return { ok: true, status: app.status };
}

/**
 * Run the post-approval pipeline for an application. Safe to call twice — the
 * second call joins the in-flight run instead of starting a competing one.
 */
export function runPipeline(appId, { fromStep = 'generate_cv' } = {}) {
    const key = String(appId);
    if (running.has(key)) return running.get(key);

    const promise = execute(key, fromStep).finally(() => running.delete(key));
    running.set(key, promise);
    return promise;
}

export const isRunning = (appId) => running.has(String(appId));

/** Retry a failed step and everything after it. */
export async function retryFrom(app, stepName) {
    if (!STEP_ORDER.includes(stepName)) throw new Error(`Unknown step "${stepName}".`);
    await resetStepsFrom(app, stepName);

    // Rewind the status so the FSM allows the step to run again.
    if (stepName === 'generate_cv' && app.status !== 'cv_failed') {
        app.status = 'approved';
        await app.save();
    } else if (stepName === 'send_email' && app.status === 'email_failed') {
        app.status = 'email_drafted';
        await app.save();
    }

    return runPipeline(app._id, { fromStep: stepName });
}

/** Send an application that is paused at "email drafted" (the Review & Send action). */
export async function sendDraft(app, { subject, body, recipients } = {}) {
    const profile = await UserProfile.findOne({ email: app.userEmail });

    if (subject || body || recipients) {
        app.email = {
            ...(app.email?.toObject?.() || {}),
            subject: subject ?? app.email?.subject,
            body: body ?? app.email?.body,
        };
        if (recipients?.length) app.contacts = recipients;
        await app.save();
    }

    return stepSendEmail(app, profile);
}
