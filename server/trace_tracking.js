
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import mongoose from 'mongoose';
import 'dotenv/config';
import JobRequest from './models/JobRequest.js';
import Reply from './models/Reply.js';

async function traceTracking() {
    console.log('--- Deep Trace: Reply Tracking ---');
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('✅ Connected to MongoDB');

        const client = new ImapFlow({
            host: 'imap.gmail.com',
            port: 993,
            secure: true,
            auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
            logger: false
        });

        await client.connect();
        console.log('✅ Connected to IMAP');

        let lock = await client.getMailboxLock('INBOX');
        try {
            console.log('Searching for UNSEEN messages...');
            const uids = await client.search({ seen: false });
            console.log(`Found ${uids.length} unread UIDs: ${uids.slice(0, 10).join(', ')}${uids.length > 10 ? '...' : ''}`);

            for (const uid of uids) {
                const msg = await client.fetchOne(uid, { source: true }, { uid: true });
                const parsed = await simpleParser(msg.source);
                const fromEmail = parsed.from?.value?.[0]?.address;

                if (fromEmail === 'rupak4865@gmail.com') {
                    console.log(`\n🔍 TRACING: Message from ${fromEmail} (Subject: ${parsed.subject})`);

                    const originalJob = await JobRequest.findOne({
                        sentTo: fromEmail,
                        status: 'sent'
                    }).sort({ sentAt: -1 });

                    if (originalJob) {
                        console.log(`   ✅ Match found in JobRequest! Job: ${originalJob.jobTitle}, User: ${originalJob.userEmail}`);

                        const existingReply = await Reply.findOne({
                            userEmail: originalJob.userEmail,
                            fromEmail: fromEmail,
                            receivedAt: { $gte: new Date(Date.now() - 60000 * 60) }
                        });

                        if (existingReply) {
                            console.log(`   ❌ Deduplication: Already exists in DB.`);
                        } else {
                            console.log(`   🚀 Success: This message WOULD be saved as a reply!`);
                        }
                    } else {
                        console.log(`   ❌ No Match: No 'sent' JobRequest found with ${fromEmail} in sentTo.`);
                        // Check ALL jobs for this email regardless of status
                        const anyJob = await JobRequest.findOne({ sentTo: fromEmail });
                        if (anyJob) {
                            console.log(`   ℹ Note: Found a JobRequest but status is '${anyJob.status}', not 'sent'.`);
                        }
                    }
                }
            }
        } finally {
            lock.release();
        }
        await client.logout();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}
traceTracking();
