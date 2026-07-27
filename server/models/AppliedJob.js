import mongoose from 'mongoose';

/**
 * The ledger of jobs this user has actually applied to.
 *
 * Job discovery is spread across nine sources, the URL-paste flow and autopilot,
 * and each of those previously tracked "applied" in its own way (DiscoveredJob.status,
 * JobApplication.status, or not at all). That made re-applying to the same posting on
 * a later scan the default outcome. This collection is the one place all of them
 * consult, keyed by the canonical `jobKey` from services/jobSources/shared.js.
 */
const appliedJobSchema = new mongoose.Schema({
    userEmail: { type: String, required: true, index: true },
    jobKey: { type: String, required: true },
    applyUrl: { type: String, default: null },
    title: { type: String, default: '' },
    company: { type: String, default: '' },
    appliedAt: { type: Date, default: Date.now },
    // Null means the account owner applied themselves.
    appliedBy: { type: String, default: null },
    jobRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobRequest', default: null },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobApplication', default: null },
});

// One row per (user, job): the upsert in recordApplied relies on this.
appliedJobSchema.index({ userEmail: 1, jobKey: 1 }, { unique: true });

export default mongoose.model('AppliedJob', appliedJobSchema);
