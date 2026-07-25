import 'dotenv/config';
import cron from 'node-cron';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import Reply from '../models/Reply.js';
import JobRequest from '../models/JobRequest.js';
import { chatJson } from './llm.js';

/**
 * Reply Tracking Service
 * Periodically checks the Gmail Inbox for replies to sent outreach.
 */
export function initReplyTrackingService() {
    console.log('📬 Reply Tracking Service Initialized');

    // Run every 5 minutes (can be adjusted)
    cron.schedule('*/5 * * * *', async () => {
        console.log('[Reply Tracker] Checking for new replies...');
        await checkForNewReplies();
    });
}

export async function checkForNewReplies() {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.warn('[Reply Tracker] ⚠ Gmail credentials missing. Skipping scan.');
        return;
    }

    const client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        },
        logger: false,
        connectionTimeout: 30000, // Increase to 30s
        greetingTimeout: 30000
    });

    // CRITICAL: Handle uncaught errors to prevent crashes
    client.on('error', err => {
        console.error('[Reply Tracker] Client Error Event:', err.message);
    });

    try {
        await client.connect();
        console.log('[Reply Tracker] ✅ IMAP Connected successfully');
        let lock = await client.getMailboxLock('INBOX');
        console.log('[Reply Tracker] 🔓 Mailbox locked for scanning');

        try {
            // 1. Get all unique emails we've sent outreach to
            const sentJobs = await JobRequest.find({ status: 'sent' });
            const targetEmails = [...new Set(sentJobs.flatMap(j => j.sentTo))];

            if (targetEmails.length === 0) {
                console.log('[Reply Tracker] No sent outreach found. Skipping scan.');
                return;
            }

            console.log(`[Reply Tracker] 🔍 Scanning for replies from ${targetEmails.length} targets...`);

            let processedCount = 0;
            for (const targetEmail of targetEmails) {
                try {
                    // Search for UNSEEN messages from this specific target
                    const uids = await client.search({ from: targetEmail, seen: false });

                    for (const uid of uids) {
                        try {
                            const msg = await client.fetchOne(uid, { source: true }, { uid: true });
                            if (!msg || !msg.source) continue;

                            const parsed = await simpleParser(msg.source);
                            const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase();
                            if (!fromEmail) continue;

                            const subject = parsed.subject || '(No Subject)';
                            const body = parsed.text || '';

                            console.log(`   [Scanner] 📬 Found relevant reply from ${fromEmail} | ${subject}`);

                            // Match to JobRequest
                            const originalJob = await JobRequest.findOne({
                                sentTo: fromEmail,
                                status: 'sent'
                            }).sort({ sentAt: -1 });

                            if (originalJob) {
                                // Check deduplication
                                const existingReply = await Reply.findOne({
                                    userEmail: originalJob.userEmail,
                                    fromEmail: fromEmail,
                                    receivedAt: { $gte: new Date(Date.now() - 60000 * 60) } // within last hour
                                });

                                if (!existingReply) {
                                    console.log(`[Reply Tracker] Processing reply from ${fromEmail} for "${originalJob.jobTitle}"`);
                                    const analysis = await analyzeReply(body);

                                    const newReply = new Reply({
                                        userEmail: originalJob.userEmail,
                                        jobRequestId: originalJob._id,
                                        fromEmail: fromEmail,
                                        subject: subject,
                                        body: body,
                                        sentiment: analysis.sentiment,
                                        category: analysis.category,
                                        receivedAt: new Date()
                                    });

                                    await newReply.save();
                                    processedCount++;
                                    console.log(`[Reply Tracker] ✅ Saved: ${analysis.sentiment} / ${analysis.category}`);

                                    // Mark as seen ONLY if we actually processed it as a relevant reply
                                    await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
                                } else {
                                    // If it matches but already exists, we should still mark as seen to avoid re-checking
                                    await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
                                }
                            }
                            // Delay slightly between fetches for the same target
                            await new Promise(r => setTimeout(r, 50));
                        } catch (msgErr) {
                            console.error(`[Reply Tracker] ❌ UID ${uid} error:`, msgErr.message);
                        }
                    }
                    // Delay between targets
                    await new Promise(r => setTimeout(r, 50));
                } catch (emailErr) {
                    console.error(`[Reply Tracker] Error searching for ${targetEmail}:`, emailErr.message);
                }
            }
            console.log(`[Reply Tracker] Scan complete. Processed ${processedCount} relevant replies.`);
        } finally {
            lock.release();
            console.log('[Reply Tracker] 🔒 Mailbox lock released');
        }

        await client.logout();
    } catch (err) {
        console.error('[Reply Tracker] Error:', err.message);
    }
}

/**
 * Classifies the sentiment and category of a reply.
 */
async function analyzeReply(text) {
    if (!text || text.trim().length === 0) {
        return { sentiment: 'neutral', category: 'other' };
    }

    try {
        const result = await chatJson({
            system: "You classify email replies to job outreach from recruiters, hiring managers and employees.",
            user: `Email reply content:
---
${text.slice(0, 3000)}
---

CATEGORY DEFINITIONS:
- "interview": the sender wants to schedule a call, meeting or interview.
- "info": the sender is asking for more information, a resume update, or a portfolio link.
- "rejection": the sender states they are not moving forward, or the position is filled.
- "other": any other professional response.

Treat an out-of-office auto-reply as neutral/other.`,
            schema: {
                type: 'object',
                properties: {
                    sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
                    category: { type: 'string', enum: ['interview', 'rejection', 'info', 'other'] },
                },
                required: ['sentiment', 'category'],
                additionalProperties: false,
            },
            schemaName: 'reply_analysis',
            temperature: 0.1, // consistent classification
            maxTokens: 100,
            label: 'analyze-reply',
        });

        // The schema constrains these, but a json_object fallback path does not.
        const validSentiments = ['positive', 'neutral', 'negative'];
        const validCategories = ['interview', 'rejection', 'info', 'other'];
        if (!validSentiments.includes(result.sentiment)) result.sentiment = 'neutral';
        if (!validCategories.includes(result.category)) result.category = 'other';

        return result;
    } catch (e) {
        console.error('[Reply Tracker] AI Analysis failed for text:', text.slice(0, 100), '... Error:', e.message);
        return { sentiment: 'unknown', category: 'other' };
    }
}
