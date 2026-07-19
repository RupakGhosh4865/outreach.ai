import cron from 'node-cron';
import nodemailer from 'nodemailer';
import Groq from "groq-sdk";
import fs from 'fs';
import JobRequest from '../models/JobRequest.js';
import UserProfile from '../models/UserProfile.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Follow-Up Reminder Service
 * Scans for job requests where follow-up is due and sends an automated nudge.
 */
export function initReminderService() {
    console.log('⏰ Follow-Up Reminder Service Initialized');

    // Run every minute (for testing, should be '0 * * * *' in production)
    cron.schedule('* * * * *', async () => {
        console.log('[Reminder Service] Checking for due follow-ups...');
        const now = new Date();

        try {
            const dueFollowUps = await JobRequest.find({
                followUpStatus: 'pending',
                followUpDate: { $lte: now }
            });

            if (dueFollowUps.length > 0) {
                console.log(`[Reminder Service] Found ${dueFollowUps.length} follow-ups due. Sending automated nudges...`);

                for (const job of dueFollowUps) {
                    await sendAutomatedFollowUp(job);
                }
            }
        } catch (err) {
            console.error('[Reminder Service] Error during scan:', err.message);
        }
    });
}

/**
 * Generates and sends an automated follow-up email
 */
async function sendAutomatedFollowUp(job) {
    try {
        const profile = await UserProfile.findOne({ email: job.userEmail });
        if (!profile) {
            console.error(`[Reminder Service] No profile found for ${job.userEmail}. Skipping follow-up.`);
            job.followUpStatus = 'failed';
            await job.save();
            return;
        }

        const gmailUser = process.env.GMAIL_USER;
        const gmailPass = process.env.GMAIL_APP_PASSWORD;

        if (!gmailUser || !gmailPass) {
            console.error('[Reminder Service] Gmail credentials not configured. Skipping follow-up.');
            return;
        }

        // 1. Generate Follow-Up Content using Groq
        const systemPrompt = "You are a professional career coach. Write a very short, friendly, and respectful follow-up 'nudge' email.";
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

        const res = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
            max_tokens: 300,
        });

        const followUpBody = res.choices[0].message.content.trim();
        const followUpSubject = `Follow-up: ${job.generatedEmailSubject}`;

        // 2. Prepare Mailer
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

        // 3. Send to all original recipients
        for (const recipientEmail of job.sentTo) {
            await transporter.sendMail({
                from: `"${profile.name || job.userEmail}" <${gmailUser}>`,
                to: recipientEmail,
                subject: followUpSubject,
                text: followUpBody,
                html: `<div style="font-family:sans-serif;white-space:pre-wrap;line-height:1.6;color:#333;">${followUpBody}</div>`,
                attachments,
            });
        }

        // 4. Update Job Record
        job.followUpStatus = 'sent';
        await job.save();

        console.log(`[Reminder Service] ✅ Automated follow-up sent for "${job.jobTitle}" at ${job.companyName} to ${job.sentTo.length} recipients.`);

    } catch (err) {
        console.error(`[Reminder Service] ❌ Failed to send follow-up for ${job.jobTitle}:`, err.message);
        job.followUpStatus = 'failed';
        await job.save();
    }
}
