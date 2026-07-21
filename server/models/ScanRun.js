import mongoose from 'mongoose';

const sourceStatusSchema = new mongoose.Schema({
    name: String,
    status: { type: String, enum: ['pending', 'running', 'done', 'failed', 'skipped'], default: 'pending' },
    found: { type: Number, default: 0 },
    error: String,
}, { _id: false });

const scanRunSchema = new mongoose.Schema({
    userEmail: { type: String, required: true, index: true },
    status: { type: String, enum: ['running', 'done', 'failed'], default: 'running' },
    roles: [String],
    sources: [sourceStatusSchema],
    councilProgress: {
        done: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        unreachable: [String],
    },
    totalFound: { type: Number, default: 0 },
    totalScored: { type: Number, default: 0 },
    error: String,
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date,
}, { timestamps: true });

export default mongoose.model('ScanRun', scanRunSchema);
