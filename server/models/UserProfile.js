import mongoose from 'mongoose';

const userProfileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  googleId: { type: String, unique: true, sparse: true },
  linkedinId: { type: String, unique: true, sparse: true },
  linkedinUrl: { type: String, default: null },
  githubUrl: { type: String, default: null },
  portfolioUrl: { type: String, default: null },
  techStack: { type: String, default: null },
  experienceYears: { type: Number, default: 0 },
  experienceMonths: { type: Number, default: 0 },
  targetRoles: { type: String, default: null },
  resumePath: { type: String, default: null },
  resumeOriginalName: { type: String, default: null },
  resumeLink: { type: String, default: null },
  // AI Resume Optimizer — two role-specific resumes
  resumeGenaiPath: { type: String, default: null },
  resumeGenaiName: { type: String, default: null },
  resumeBackendPath: { type: String, default: null },
  resumeBackendName: { type: String, default: null },
  // Per-user Gmail sending. When present, outreach goes out from the user's own
  // mailbox (aligned SPF/DKIM, replies land with them) instead of the shared one.
  gmail: {
    address: { type: String, default: null },
    refreshToken: { type: String, default: null, select: false },
    connectedAt: { type: Date, default: null },
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  subscription: {
    plan: { type: String, enum: ['free', 'starter', 'pro', 'team'], default: 'free' },
    status: { type: String, default: 'active' },
    campaignsUsed: { type: Number, default: 0 },
    lastResetDate: { type: Date, default: Date.now }
  }
});

userProfileSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('UserProfile', userProfileSchema);
