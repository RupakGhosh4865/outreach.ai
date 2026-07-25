import mongoose from 'mongoose';

const jobResultSchema = new mongoose.Schema({
    extId: String,
    title: String,
    company: String,
    location: String,
    salaryMin: Number,
    salaryMax: Number,
    postedAt: Date,
    closingDate: Date,
    source: { type: String, enum: ['adzuna', 'jsearch', 'linkedin', 'indeed', 'glassdoor', 'wellfound', 'google', 'github', 'council'] },
    sourceDetail: String,
    visaSponsor: Boolean,
    applyUrl: String,
    description: String,
}, { _id: false });

/**
 * TTL for every cached search, exported so callers can't set a staleness window
 * longer than the window Mongo will actually keep the document for.
 */
export const CACHE_TTL_SECONDS = 12 * 60 * 60; // 12h

const jobSearchCacheSchema = new mongoose.Schema({
    queryHash: { type: String, index: true, unique: true },
    role: String,
    keywords: [String],
    results: [jobResultSchema],
    createdAt: { type: Date, default: Date.now, expires: CACHE_TTL_SECONDS },
});

export default mongoose.model('JobSearchCache', jobSearchCacheSchema);
