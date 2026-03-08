
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import mongoose from 'mongoose';
import 'dotenv/config';
import JobRequest from './models/JobRequest.js';
import Reply from './models/Reply.js';

async function testFull() {
    console.log('--- Full Discovery Test ---');
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('✅ Connected to MongoDB');

        const client = new ImapFlow({
            host: 'imap.gmail.com',
            port: 993,
            secure: true,
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD
            },
            logger: false
        });

        await client.connect();
        console.log('✅ Connected to IMAP');

        let lock = await client.getMailboxLock('INBOX');
        try {
            const uids = await client.search({ seen: false });
            console.log(`Found ${uids.length} unread UIDs`);

            let limit = 5;
            for (const uid of uids) {
                if (limit <= 0) break;
                limit--;

                const msg = await client.fetchOne(uid, { source: true }, { uid: true });
                const parsed = await simpleParser(msg.source);
                const fromEmail = parsed.from?.value?.[0]?.address;
                const subject = parsed.subject;

                console.log(`\nChecking Message: "${subject}" from <${fromEmail}>`);

                const originalJob = await JobRequest.findOne({
                    sentTo: fromEmail,
                    status: 'sent'
                });

                if (originalJob) {
                    console.log(`   ✅ MATCH FOUND: Job "${originalJob.jobTitle}"`);
                } else {
                    console.log(`   ❌ NO MATCH: Looking for "${fromEmail}" in sentTo list of JobRequests.`);
                    // Let's see some sentTo addresses in the DB for context
                    const sampleJobs = await JobRequest.find({ status: 'sent' }).limit(3);
                    console.log(`   Samples in DB: ${sampleJobs.map(j => j.sentTo.join(', ')).join(' | ')}`);
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

testFull();
