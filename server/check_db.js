
import mongoose from 'mongoose';
import 'dotenv/config';
import Reply from './models/Reply.js';
import JobRequest from './models/JobRequest.js';

async function checkDb() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('✅ Connected to MongoDB');

        const replyCount = await Reply.countDocuments();
        const jobCount = await JobRequest.countDocuments();
        const sentJobs = await JobRequest.countDocuments({ status: 'sent' });

        console.log(`Total Replies: ${replyCount}`);
        console.log(`Total JobRequests: ${jobCount}`);
        console.log(`JobRequests with 'sent' status: ${sentJobs}`);

        if (replyCount > 0) {
            const latestReplies = await Reply.find().sort({ receivedAt: -1 }).limit(5);
            console.log('--- Latest 5 Replies ---');
            latestReplies.forEach(r => {
                console.log(`From: ${r.fromEmail}, User: ${r.userEmail}, Senti: ${r.sentiment}, Cat: ${r.category}`);
            });
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

checkDb();
