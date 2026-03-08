import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: { type: String, required: true },
    position: String,
    phone: String,
    linkedinUrl: String,
    source: { type: String, enum: ['hunter', 'scrape', 'manual', 'autopilot'], default: 'manual' },
    createdAt: { type: Date, default: Date.now },
});

const companyContactSchema = new mongoose.Schema({
    companyName: { type: String, required: true }, // unique index set below
    companyDomain: { type: String, index: true },
    contacts: [contactSchema],
    updatedAt: { type: Date, default: Date.now },
});

// Ensure unique company entries (one document per company)
companyContactSchema.index({ companyName: 1 }, { unique: true });


export default mongoose.model('CompanyContact', companyContactSchema);
