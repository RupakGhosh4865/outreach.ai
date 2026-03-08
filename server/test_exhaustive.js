
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import mongoose from 'mongoose';
import 'dotenv/config';
import JobRequest from './models/JobRequest.js';

async function testExhaustive() {
    console.log('--- Exhaustive Targeted Test ---');
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const sentJobs = await JobRequest.find({ status: 'sent' });
        const targetEmails = [...new Set(sentJobs.flatMap(j => j.sentTo))];
        console.log(`Unique targets: ${targetEmails.length}`);

        const client = new ImapFlow({
            host: 'imap.gmail.com',
            port: 993,
            secure: true,
            auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
            logger: false
        });

        await client.connect();
        let lock = await client.getMailboxLock('INBOX');
        try {
            for (const email of targetEmails) {
                // Check ALL vs UNSEEN
                const allUids = await client.search({ from: email });
                const unseenUids = await client.search({ from: email, seen: false });

                if (allUids.length > 0) {
                    console.log(`\nEmail: ${email}`);
                    console.log(`  - Total messages: ${allUids.length}`);
                    console.log(`  - Unread messages: ${unseenUids.length}`);

                    for (const uid of unseenUids) {
                        const msg = await client.fetchOne(uid, { envelope: true }, { uid: true });
                        console.log(`    [UNREAD] Subject: ${msg.envelope.subject}`);
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
testExhaustive();
