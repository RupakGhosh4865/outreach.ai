import mongoose from 'mongoose';

/**
 * Cross-process mutex. A unique `key` means only one holder can exist at a time,
 * and the TTL index guarantees a lock held by a process that died is eventually
 * released without operator intervention.
 */
const lockSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    owner: { type: String, required: true },   // instance id, for debugging
    acquiredAt: { type: Date, default: Date.now },
    // Mongo removes the document at this time, releasing an abandoned lock.
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export default mongoose.model('Lock', lockSchema);
