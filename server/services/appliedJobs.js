import AppliedJob from '../models/AppliedJob.js';
import { jobKey } from './jobSources/shared.js';

/**
 * Record that a job has been applied to. Idempotent — re-sending to the same
 * posting updates the existing row rather than adding a second one.
 *
 * Never throws: an application that succeeded must not be reported as failed
 * because the ledger write hiccuped. A missed write only means the job may be
 * offered again later.
 *
 * @returns {Promise<string|null>} the jobKey written, or null if it couldn't be derived
 */
export async function recordApplied({ userEmail, title, company, applyUrl, appliedBy = null, jobRequestId = null, applicationId = null }) {
    const key = jobKey(title, company, applyUrl);
    if (!key || !userEmail) return null;

    // Only ever set the ids we were actually given, so a send that knows just the
    // JobRequest doesn't wipe an applicationId recorded by an earlier one.
    const set = { applyUrl: applyUrl || null, title: title || '', company: company || '', appliedBy };
    if (jobRequestId) set.jobRequestId = jobRequestId;
    if (applicationId) set.applicationId = applicationId;

    try {
        await AppliedJob.updateOne(
            { userEmail, jobKey: key },
            { $set: set, $setOnInsert: { appliedAt: new Date() } },
            { upsert: true }
        );
        return key;
    } catch (err) {
        console.warn('[AppliedJobs] Could not record application:', err.message);
        return null;
    }
}

/** The applied-jobs record for one posting, or null. */
export async function findApplied(userEmail, { title, company, applyUrl }) {
    const key = jobKey(title, company, applyUrl);
    if (!key || !userEmail) return null;
    return AppliedJob.findOne({ userEmail, jobKey: key }).lean();
}

/**
 * Every jobKey this user has applied to, mapped to when. A Map rather than a
 * Set so a scan can both test membership in O(1) and stamp the date it shows
 * on the "Applied" badge, without a second query per job.
 */
export async function appliedKeyMap(userEmail) {
    const rows = await AppliedJob.find({ userEmail }, { jobKey: 1, appliedAt: 1 }).lean();
    return new Map(rows.map((r) => [r.jobKey, r.appliedAt]));
}
