import 'dotenv/config';
import fs from 'fs';
import nodemailer from 'nodemailer';
import UserProfile from '../models/UserProfile.js';
import { stripAttachmentClaim } from './emailComposer.js';
import { documentFileName } from './resume.js';

/**
 * Load a profile for sending.
 *
 * `gmail.refreshToken` is `select: false` so it never rides along on ordinary
 * profile reads (or into an API response); this is the one place that asks for it.
 */
export const loadProfileForSending = (email) =>
    UserProfile.findOne({ email }).select('+gmail.refreshToken');

/**
 * Escape text before it goes into the HTML part of an email.
 *
 * Bodies come from an LLM and from user edits, and were previously interpolated
 * raw — a stray "<" silently ate the rest of the paragraph in most mail clients,
 * and deliberate markup would have been rendered.
 */
export function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Wrap a plain-text body in the minimal HTML part we send alongside it. */
export const bodyToHtml = (body) =>
    `<div style="font-family:sans-serif;white-space:pre-wrap;line-height:1.6;color:#333;">${escapeHtml(body)}</div>`;

/** The shared application mailbox — the fallback when a user has not connected their own. */
export function getTransporter() {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) throw new Error('Gmail credentials not configured in .env (GMAIL_USER / GMAIL_APP_PASSWORD).');
    return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
}

/** True when this profile can send from its own mailbox. */
export const hasUserMailbox = (profile) =>
    Boolean(profile?.gmail?.refreshToken && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/**
 * Transport for a specific user.
 *
 * When the user has connected their Google account with send scope we send as
 * them, which is what makes SPF/DKIM align and puts replies in their own inbox.
 * Otherwise we fall back to the shared mailbox — the previous behaviour, but now
 * a fallback rather than the only option.
 */
export async function getTransporterFor(profile) {
    if (!hasUserMailbox(profile)) return getTransporter();

    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            type: 'OAuth2',
            user: profile.gmail.address || profile.email,
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            refreshToken: profile.gmail.refreshToken,
        },
    });
}

/** The From header for a profile, matching whichever mailbox we're sending through. */
export function senderIdentity(profile, fallbackEmail) {
    const name = profile?.name || fallbackEmail || 'Outreach';
    const address = hasUserMailbox(profile)
        ? (profile.gmail.address || profile.email)
        : process.env.GMAIL_USER;
    return `"${String(name).replace(/"/g, '')}" <${address}>`;
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
export function attachResume({ optimizedPdfPath, coverPdfPath, profile, body, jobTitle, companyName, candidateName }) {
    // The recruiter sees the filename before they open anything, so it carries
    // the candidate and the role rather than "Resume_Application.pdf".
    const name = (suffix) => documentFileName({
        // The CV's own name where we have it — the account holder may be
        // applying on someone else's behalf.
        candidateName: candidateName || profile?.name, companyName, jobTitle, suffix,
    });

    // Only ever accompanies a CV — a cover letter on its own would arrive as an
    // orphan attachment referring to a resume that isn't there.
    const cover = coverPdfPath && fs.existsSync(coverPdfPath)
        ? [{ filename: name('Cover Letter'), path: coverPdfPath }]
        : [];

    if (optimizedPdfPath && fs.existsSync(optimizedPdfPath)) {
        return {
            attachments: [
                { filename: name(''), path: optimizedPdfPath },
                ...cover,
            ],
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

/**
 * Copy a sent message into the mailbox's Sent folder over IMAP.
 *
 * SMTP only hands a message to the server for delivery — it does not file a
 * copy. Gmail's web client does that itself, so mail sent through this app was
 * arriving with recipients but never showing in the user's Sent list, which
 * looks exactly like it was never sent.
 *
 * Never throws: the message has already gone out, and failing to file a copy
 * must not be reported as a failed send.
 */
async function copyToSentFolder(raw) {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass || !raw) return false;

    const { ImapFlow } = await import('imapflow');
    const client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: { user, pass },
        logger: false,
        connectionTimeout: 20000,
        greetingTimeout: 20000,
    });
    client.on('error', () => { /* handled by the catch below */ });

    try {
        await client.connect();
        // Gmail localises the folder name, so ask for the one flagged \Sent
        // rather than guessing at "Sent" or "[Gmail]/Sent Mail".
        const boxes = await client.list();
        const sent = boxes.find((b) => b.specialUse === '\\Sent')
            || boxes.find((b) => /sent/i.test(b.path));
        if (!sent) return false;

        await client.append(sent.path, raw, ['\\Seen']);
        return true;
    } catch (err) {
        console.warn('[Mailer] Could not file a copy in Sent:', err.message);
        return false;
    } finally {
        await client.logout().catch(() => { /* already closed */ });
    }
}

/** Send one email per recipient, collecting successes and failures. */
export async function sendToRecipients({ transporter, from, recipients, subject, body, attachments }) {
    const sentTo = [];
    const errors = [];

    // Builds the MIME without sending, so the exact bytes that go out are the
    // bytes filed in Sent. The SMTP transport does not hand back the raw
    // message, so composing it here is the only way to have both.
    const composer = nodemailer.createTransport({ streamTransport: true, buffer: true });

    for (const recipient of recipients) {
        try {
            const built = await composer.sendMail({
                from,
                to: recipient.email,
                subject,
                text: body,
                html: bodyToHtml(body),
                attachments,
            });

            await transporter.sendMail({ envelope: built.envelope, raw: built.message });
            sentTo.push(recipient.email);

            await copyToSentFolder(built.message);
        } catch (err) {
            console.error(`[Mailer] Failed to send to ${recipient.email}:`, err.message);
            errors.push({ email: recipient.email, error: err.message });
        }
    }

    if (sentTo.length) console.log(`[Mailer] Sent ${sentTo.length} email(s) as ${process.env.GMAIL_USER}`);
    return { sentTo, errors };
}
