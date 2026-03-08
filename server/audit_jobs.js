
import mongoose from 'mongoose';
import 'dotenv/config';
import JobRequest from './models/JobRequest.js';

async function audit() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const jobs = await JobRequest.find({ status: 'sent' }).limit(10);
        console.log(`Auditing 10 'sent' jobs:`);
        jobs.forEach(j => {
            console.log(`ID: ${j._id}, User: ${j.userEmail}, SentTo: ${j.sentTo.join(', ')}`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
audit();
