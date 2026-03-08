import mongoose from 'mongoose';

const replySchema = new mongoose.Schema({
    userEmail: { type: String, required: true },
    jobRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobRequest' },
    fromEmail: { type: String, required: true },
    subject: { type: String, default: '' },
    body: { type: String, default: '' },
    sentiment: {
        type: String,
        enum: ['positive', 'neutral', 'negative', 'unknown'],
        default: 'unknown'
    },
    category: {
        type: String,
        enum: ['interview', 'rejection', 'info', 'other'],
        default: 'other'
    },
    receivedAt: { type: Date, default: Date.now },
    isRead: { type: Boolean, default: false }
});

export default mongoose.model('Reply', replySchema);
