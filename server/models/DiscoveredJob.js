import mongoose from 'mongoose';

export const JOB_SOURCES = ['adzuna', 'jsearch', 'linkedin', 'indeed', 'glassdoor', 'wellfound', 'google', 'github', 'council'];

const discoveredJobSchema = new mongoose.Schema({
    userEmail: { type: String, required: true, index: true },

    title: { type: String, required: true },
    company: String,
    location: String,
    description: String,
    applyUrl: String,
    salaryMin: Number,
    salaryMax: Number,
    postedAt: Date,
    closingDate: Date,

    source: { type: String, enum: JOB_SOURCES, required: true },
    sourceDetail: String,   // e.g. council name, or JSearch publisher ("LinkedIn")
    visaSponsor: { type: Boolean, default: false },

    // Profile/ATS matching
    matchScore: { type: Number, default: null },
    matchedSkills: [String],
    missingSkills: [String],
    matchSummary: String,
    scoredAt: Date,

    // 'applied' is terminal: the user has already sent an application for this
    // posting, so it stays out of the radar list unless explicitly asked for.
    status: { type: String, enum: ['new', 'shortlisted', 'dismissed', 'in_pipeline', 'applied'], default: 'new', index: true },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobApplication', default: null },
    appliedAt: { type: Date, default: null },

    discoveredAt: { type: Date, default: Date.now },
}, { timestamps: true });

discoveredJobSchema.index({ userEmail: 1, matchScore: -1 });
discoveredJobSchema.index({ userEmail: 1, applyUrl: 1 }, { unique: true, sparse: true });

export default mongoose.model('DiscoveredJob', discoveredJobSchema);
