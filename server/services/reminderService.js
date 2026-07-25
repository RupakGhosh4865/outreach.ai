import cron from 'node-cron';
import fs from 'fs';
import JobRequest from '../models/JobRequest.js';
import { chatText } from './llm.js';
import { getTransporterFor, senderIdentity, sendToRecipients, loadProfileForSending } from './mailer.js';
import { claimDueJobs } from './jobClaim.js';

const FOLLOW_UP_CRON = process.env.FOLLOW_UP_CRON || '0 * * * *'; // hourly
const MAX_PER_TICK = 25;

/**
 * Follow-Up Reminder Service
 * Scans for job requests where follow-up is due and sends an automated nudge.
 */
export function initReminderService() {
    console.log(`⏰ Follow-Up Reminder Service initialised (schedule: ${FOLLOW_UP_CRON})`);

    cron.schedule(FOLLOW_UP_CRON, async () => {
        try {
            // Claim atomically: with more than one replica, an unclaimed find()
            // would have every instance sending the same follow-up.
            const dueFollowUps = await claimDueJobs({
                model: JobRequest,
                filter: { followUpStatus: 'pending', followUpDate: { $lte: new Date() } },
                claimField: 'followUpClaimedAt',
                limit: MAX_PER_TICK,
            });

            if (!dueFollowUps.length) return;
            console.log(`[Reminder Service] ${dueFollowUps.length} follow-up(s) due.`);
            for (const job of dueFollowUps) {
                await sendAutomatedFollowUp(job);
            }
        } catch (err) {
            console.error('[Reminder Service] Error during scan:', err.message);
        }
    });
}

/**
 * Record a terminal failure. Kept separate because the old code assigned a status
 * outside the schema enum, so this save() threw *inside* the error handler and the
 * record stayed `pending` — meaning a permanently failing follow-up retried forever.
 */
async function markFailed(job, reason) {
    try {
        job.followUpStatus = 'failed';
        job.followUpError = String(reason || '').slice(0, 500);
        await job.save();
    } catch (err) {
        console.error(`[Reminder Service] Could not mark job ${job._id} failed:`, err.message);
    }
}

/**
 * Generates and sends an automated follow-up email
 */
async function sendAutomatedFollowUp(job) {
    try {
        const profile = await loadProfileForSending(job.userEmail);
        if (!profile) {
            await markFailed(job, `No profile found for ${job.userEmail}.`);
            return;
        }

        // 1. Generate the nudge
        const systemPrompt = "You write short, friendly, respectful follow-up nudges. You never guilt the recipient or imply they owe a reply.";
        const userPrompt = `Context:
- Recipient: Hiring Team at ${job.companyName}
- Original Role: ${job.jobTitle}
- Original Email Subject: ${job.generatedEmailSubject}
- Original Email Body (summary): ${job.generatedEmailBody.slice(0, 500)}

Task:
Write a follow-up email (max 100 words). 
It should:
1. Reference the previous email politely.
2. Reiterate interest in the ${job.jobTitle} role.
3. Keep it brief and professional.
4. DO NOT include a subject line, just the body.

Rules:
- Professional tone.
- No placeholders like [Name]. Use "Hi there" or "Dear Team".
- Mention that the resume is still attached (and/or provide the resume link: ${profile.resumeLink || 'N/A'}) for convenience.`;

        const followUpBody = await chatText({
            system: systemPrompt,
            user: userPrompt,
            maxTokens: 300,
            temperature: 0.6,
            label: 'follow-up',
        });

        if (!followUpBody) {
            await markFailed(job, 'Model returned an empty follow-up body.');
            return;
        }

        const followUpSubject = `Follow-up: ${job.generatedEmailSubject}`;

        // 2. Prepare the mailer (per-user OAuth where configured, shared SMTP otherwise)
        const transporter = await getTransporterFor(profile);
        const from = senderIdentity(profile, job.userEmail);

        const attachments = [];
        if (profile.resumePath && fs.existsSync(profile.resumePath)) {
            attachments.push({
                filename: profile.resumeOriginalName || 'Resume.pdf',
                path: profile.resumePath,
            });
        }

        // 3. Send to all original recipients
        const { sentTo, errors } = await sendToRecipients({
            transporter,
            from,
            recipients: (job.sentTo || []).map((email) => ({ email })),
            subject: followUpSubject,
            body: followUpBody,
            attachments,
        });

        // 4. Update the record
        if (!sentTo.length) {
            await markFailed(job, errors[0]?.error || 'All follow-up sends failed.');
            return;
        }

        job.followUpStatus = 'sent';
        job.followUpSentAt = new Date();
        await job.save();

        console.log(`[Reminder Service] ✅ Follow-up sent for "${job.jobTitle}" at ${job.companyName} to ${sentTo.length}/${job.sentTo.length} recipient(s).`);
    } catch (err) {
        console.error(`[Reminder Service] ❌ Follow-up failed for ${job.jobTitle}:`, err.message);
        await markFailed(job, err.message);
    }
}
