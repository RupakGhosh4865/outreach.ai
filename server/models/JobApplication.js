import mongoose from 'mongoose';

export const APPLICATION_STATUSES = [
    'found',          // ingested, not yet validated
    'validating',
    'ready',          // validated, waiting for the user to click Apply Now
    'applying',       // user opened the company site; waiting for Approve/Deny
    'denied',         // terminal — user did not complete the application
    'approved',       // user confirmed they applied; pipeline starts here
    'cv_generating',
    'cv_generated',
    'cv_failed',
    'contacts_found',
    'email_drafted',  // paused for Review & Send (unless autoSend)
    'emailing',
    'emailed',        // terminal — happy path
    'email_failed',
];

export const PIPELINE_STEPS = ['generate_cv', 'find_contacts', 'generate_email', 'send_email'];

const stepSchema = new mongoose.Schema({
    name: { type: String, required: true },
    status: { type: String, enum: ['pending', 'running', 'done', 'error', 'skipped'], default: 'pending' },
    error: String,
    startedAt: Date,
    finishedAt: Date,
}, { _id: false });

const contactSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: String,
    position: String,
    linkedinUrl: String,
    source: String,
}, { _id: false });

const jobApplicationSchema = new mongoose.Schema({
    userEmail: { type: String, required: true, index: true },
    source: { type: String, enum: ['uk-search', 'user-link', 'document', 'manual'], default: 'user-link' },

    // Job snapshot — kept on the application so the pipeline never re-scrapes.
    jobTitle: String,
    companyName: String,
    location: String,
    jobDescription: String,
    applyUrl: String,
    applyMethod: { type: String, enum: ['direct', 'external', 'unknown'], default: 'unknown' },
    validation: {
        status: { type: String, enum: ['unknown', 'open', 'closed', 'unreachable'], default: 'unknown' },
        reason: String,
        checkedAt: Date,
    },

    status: { type: String, enum: APPLICATION_STATUSES, default: 'found', index: true },
    steps: { type: [stepSchema], default: () => PIPELINE_STEPS.map((name) => ({ name, status: 'pending' })) },

    cv: {
        pdfPath: String,
        candidateName: String,
        coverPdfPath: String,
        coverText: String,
        content: mongoose.Schema.Types.Mixed, // structured JSON resume
        matchScore: Number,
        atsTips: [String],
        addedKeywords: [String],
        matchedKeywords: [String],
        missingKeywords: [String],
        error: String,
    },

    contacts: { type: [contactSchema], default: [] },
    companyDomain: String,

    email: {
        subject: String,
        body: String,
        to: [String],
        attachmentStatus: String,
        sentAt: Date,
        errors: [{ email: String, error: String, _id: false }],
    },

    emailType: { type: String, default: 'referral' },
    extraContext: String,
    autoSend: { type: Boolean, default: false },

    appliedAt: Date,
    approvedAt: Date,
    deniedAt: Date,

    // Who drove this application (null = the account owner), and how long it took
    // from the job entering the pipeline to the email going out.
    appliedBy: { type: String, default: null },
    applyStartedAt: { type: Date, default: null },
    applyDurationMs: { type: Number, default: null },
}, { timestamps: true });

// One application per user per job posting.
jobApplicationSchema.index({ userEmail: 1, applyUrl: 1 }, { unique: true, sparse: true });

export default mongoose.model('JobApplication', jobApplicationSchema);
