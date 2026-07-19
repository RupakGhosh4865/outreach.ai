import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: String,
    position: String,
    phone: String,
    linkedinUrl: String,
});

const jobRequestSchema = new mongoose.Schema({
    userEmail: { type: String, required: true },
    linkedinUrl: { type: String, default: '' },
    companyName: { type: String, default: '' },
    companyDomain: { type: String, default: '' },
    jobTitle: { type: String, default: '' },
    jobDescription: { type: String, default: '' },
    emailType: {
        type: String,
        enum: ['referral', 'direct_apply', 'vacancy_inquiry'],
        default: 'referral',
    },
    extraContext: { type: String, default: '' },
    manualEmail: { type: String, default: '' },
    manualPhone: { type: String, default: '' },
    employees: [employeeSchema],
    generatedEmailSubject: { type: String, default: '' },
    generatedEmailBody: { type: String, default: '' },
    sentTo: [String],
    status: {
        type: String,
        enum: ['draft', 'generated', 'sent', 'failed'],
        default: 'draft',
    },
    createdAt: { type: Date, default: Date.now },
    sentAt: { type: Date, default: null },
    // Apply Timing / Scheduling
    scheduledAt: { type: Date, default: null },         // null = send immediately
    isScheduled: { type: Boolean, default: false },     // true if user picked a future send time
    // Resume Optimizer Integration
    optimizedResumeUsed: { type: String, default: null }, // 'genai' | 'backend' | null
    optimizedMatchScore: { type: Number, default: null }, // ATS match score of selected resume
    optimizedAddedKeywords: { type: [String], default: [] },
    optimizedAtsTips: { type: [String], default: [] },
    // Follow-up System fields
    followUpDays: { type: Number, default: 0 }, // 0 = no follow-up, 3, 5, 7 etc.
    followUpDate: { type: Date, default: null },
    followUpStatus: {
        type: String,
        enum: ['none', 'pending', 'due', 'sent', 'cancelled'],
        default: 'none'
    },
});

export default mongoose.model('JobRequest', jobRequestSchema);
