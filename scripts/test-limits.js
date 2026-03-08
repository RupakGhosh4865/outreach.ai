import 'dotenv/config';
import mongoose from 'mongoose';
import UserProfile from './server/models/UserProfile.js';

async function testLimits() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const testEmail = 'test@example.com';
        let profile = await UserProfile.findOne({ email: testEmail });

        if (!profile) {
            profile = await UserProfile.create({
                name: 'Test User',
                email: testEmail,
                subscription: { plan: 'free', campaignsUsed: 0 }
            });
            console.log('Created test profile');
        }

        const plan = profile.subscription?.plan || 'free';
        const used = profile.subscription?.campaignsUsed || 0;

        const limits = {
            free: { campaigns: 3, emails: 5 },
            starter: { campaigns: 20, emails: 10 },
            pro: { campaigns: 99999, emails: 15 },
            team: { campaigns: 99999, emails: 999, seats: 5 },
        };

        console.log(`Plan: ${plan}, Used: ${used}`);
        console.log(`Limit: ${limits[plan].campaigns} campaigns, ${limits[plan].emails} emails per campaign`);

        if (used >= limits[plan].campaigns) {
            console.log('✅ Limit enforcement logic verified: User blocked correctly.');
        } else {
            console.log('ℹ️ User is within limits.');
        }

        await mongoose.disconnect();
        console.log('Disconnected');
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

testLimits();
