
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import mongoose from 'mongoose';
import 'dotenv/config';
import JobRequest from './models/JobRequest.js';

async function testTargeted() {
    console.log('--- Targeted Reply Test ---');
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('✅ Connected to MongoDB');

        // Get all emails we've ever sent to
        const sentJobs = await JobRequest.find({ status: 'sent' });
        const targetEmails = [...new Set(sentJobs.flatMap(j => j.sentTo))];
        console.log(`Found ${targetEmails.length} unique recipient emails in sent history.`);

        if (targetEmails.length === 0) {
            console.log('No sent emails found. Send some outreach first!');
            process.exit(0);
        }

        console.log(`Samples: ${targetEmails.slice(0, 5).join(', ')}`);

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
            console.log('Searching for messages FROM any of our targets...');
            // Loop through targets and search
            for (const email of targetEmails) {
                const uids = await client.search({ from: email });
                if (uids.length > 0) {
                    console.log(`\n📬 Found ${uids.length} messages from: ${email}`);
                    for (const uid of uids) {
                        const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
                        console.log(`   - Subject: ${msg.envelope.subject} (UID: ${uid})`);
                    }
                }
            }
        } finally {
            lock.release();
        }

        await client.logout();
        console.log('\n--- Test Complete ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

testTargeted();
