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

const jobSearchCacheSchema = new mongoose.Schema({
    queryHash: { type: String, index: true, unique: true },
    role: String,
    keywords: [String],
    results: [jobResultSchema],
    createdAt: { type: Date, default: Date.now, expires: 21600 }, // 6h TTL
});

export default mongoose.model('JobSearchCache', jobSearchCacheSchema);
