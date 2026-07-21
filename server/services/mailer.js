import 'dotenv/config';
import fs from 'fs';
import nodemailer from 'nodemailer';
import { stripAttachmentClaim } from './emailComposer.js';

export function getTransporter() {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) throw new Error('Gmail credentials not configured in .env (GMAIL_USER / GMAIL_APP_PASSWORD).');
    return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
}

/**
 * Decide what resume to attach and keep the body honest about it.
 *
 * Order: freshly optimized PDF → the profile's stored resume → none.
 * When nothing can be attached, the "resume is attached" claim is stripped from
 * the body so the email never promises a file it isn't carrying.
 *
 * @returns {{ attachments: Array, body: string, attachmentStatus: 'optimized'|'profile'|'missing' }}
 */
export function attachResume({ optimizedPdfPath, profile, body, jobTitle }) {
    if (optimizedPdfPath && fs.existsSync(optimizedPdfPath)) {
        return {
            attachments: [{
                filename: `Resume_${(jobTitle || 'Application').replace(/[^\w-]+/g, '_')}.pdf`,
                path: optimizedPdfPath,
            }],
            body,
            attachmentStatus: 'optimized',
        };
    }

    if (profile?.resumePath && fs.existsSync(profile.resumePath)) {
        return {
            attachments: [{
                filename: profile.resumeOriginalName || 'Resume.pdf',
                path: profile.resumePath,
            }],
            body,
            attachmentStatus: 'profile',
        };
    }

    console.warn('[Mailer] No resume available to attach — removing the "attached" claim from the email body.');
    return { attachments: [], body: stripAttachmentClaim(body), attachmentStatus: 'missing' };
}

/** Send one email per recipient, collecting successes and failures. */
export async function sendToRecipients({ transporter, from, recipients, subject, body, attachments }) {
    const sentTo = [];
    const errors = [];

    for (const recipient of recipients) {
        try {
            await transporter.sendMail({
                from,
                to: recipient.email,
                subject,
                text: body,
                html: `<div style="font-family:sans-serif;white-space:pre-wrap;line-height:1.6;color:#333;">${body}</div>`,
                attachments,
            });
            sentTo.push(recipient.email);
        } catch (err) {
            console.error(`[Mailer] Failed to send to ${recipient.email}:`, err.message);
            errors.push({ email: recipient.email, error: err.message });
        }
    }

    return { sentTo, errors };
}
