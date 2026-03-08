'use client';
import { useState } from 'react';
import { Users, Briefcase, FileText, Sparkles, ArrowRight, CheckCircle } from 'lucide-react';

export default function Onboarding({ onFinish }) {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        name: '',
        roleType: 'tech', // tech or non-tech
        targetRole: '',
        experience: '',
        resume: null
    });

    const nextStep = () => setStep(s => s + 1);
    const prevStep = () => setStep(s => s - 1);

    const steps = [
        { id: 1, title: 'Basics', icon: <Users size={18} /> },
        { id: 2, title: 'Role', icon: <Briefcase size={18} /> },
        { id: 3, title: 'Resume', icon: <FileText size={18} /> },
        { id: 4, title: 'Ready', icon: <Sparkles size={18} /> }
    ];

    return (
        <div className="onboarding-overlay">
            <div className="onboarding-card card">
                <div className="stepper" style={{ marginBottom: 40 }}>
                    {steps.map((s, i) => (
                        <div key={s.id} className="step-item">
                            <div className={`step-circle ${step === s.id ? 'active' : step > s.id ? 'done' : ''}`}>
                                {step > s.id ? <CheckCircle size={16} /> : s.id}
                            </div>
                            <div className={`step-label ${step === s.id ? 'active' : ''}`}>{s.title}</div>
                            {i < steps.length - 1 && <div className={`step-line ${step > s.id ? 'done' : ''}`} />}
                        </div>
                    ))}
                </div>

                {step === 1 && (
                    <div className="onboarding-step reveal animate-fade-in-up">
                        <h2 className="step-title">Let's get started</h2>
                        <p className="step-desc">First, what should we call you?</p>
                        <div className="form-group">
                            <label>Full Name</label>
                            <input
                                type="text"
                                placeholder="Jane Doe"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                autoFocus
                            />
                        </div>
                        <button className="btn btn-primary btn-full btn-lg" onClick={nextStep} disabled={!formData.name}>
                            Continue <ArrowRight size={18} />
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div className="onboarding-step reveal animate-fade-in-up">
                        <h2 className="step-title">What's your focus?</h2>
                        <p className="step-desc">We'll tailor your outreach based on your role.</p>

                        <div className="radio-group" style={{ marginBottom: 24 }}>
                            <div className="radio-option">
                                <input
                                    type="radio" id="tech" name="role"
                                    checked={formData.roleType === 'tech'}
                                    onChange={() => setFormData({ ...formData, roleType: 'tech' })}
                                />
                                <label htmlFor="tech">
                                    <span className="radio-icon">💻</span>
                                    <span className="radio-label">Tech Guest</span>
                                    <span className="radio-desc">Engineering, Product, Design</span>
                                </label>
                            </div>
                            <div className="radio-option">
                                <input
                                    type="radio" id="nontech" name="role"
                                    checked={formData.roleType === 'nontech'}
                                    onChange={() => setFormData({ ...formData, roleType: 'nontech' })}
                                />
                                <label htmlFor="nontech">
                                    <span className="radio-icon">🤝</span>
                                    <span className="radio-label">Non-Tech</span>
                                    <span className="radio-desc">Sales, Ops, Marketing</span>
                                </label>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Target Role</label>
                            <input
                                type="text"
                                placeholder="e.g. Senior Frontend Developer"
                                value={formData.targetRole}
                                onChange={e => setFormData({ ...formData, targetRole: e.target.value })}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: 12 }}>
                            <button className="btn btn-secondary btn-lg" onClick={prevStep}>Back</button>
                            <button className="btn btn-primary btn-lg btn-full" onClick={nextStep} disabled={!formData.targetRole}>
                                Move On <ArrowRight size={18} />
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="onboarding-step reveal animate-fade-in-up">
                        <h2 className="step-title">Upload your resume</h2>
                        <p className="step-desc">Our AI will parse this to write better emails (Optional).</p>

                        <div className="file-upload" style={{ marginBottom: 24 }}>
                            <input type="file" onChange={e => setFormData({ ...formData, resume: e.target.files[0] })} />
                            <div className="upload-icon">📄</div>
                            <div className="upload-text">{formData.resume ? formData.resume.name : 'Drop your resume here'}</div>
                            <div className="upload-hint">PDF or Word, max 5MB</div>
                        </div>

                        <div style={{ display: 'flex', gap: 12 }}>
                            <button className="btn btn-secondary btn-lg" onClick={prevStep}>Back</button>
                            <button className="btn btn-primary btn-lg btn-full" onClick={nextStep}>
                                {formData.resume ? 'Resume Attached' : 'Skip for now'} <ArrowRight size={18} />
                            </button>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div className="onboarding-step reveal animate-fade-in-up" style={{ textAlign: 'center' }}>
                        <div className="success-icon" style={{ fontSize: '4rem', marginBottom: 24 }}>✨</div>
                        <h2 className="step-title">You're all set!</h2>
                        <p className="step-desc" style={{ maxWidth: 'unset' }}>
                            We've prepared your profile. Now, sign in with Google or LinkedIn to finalize your account and start your outreach.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 32 }}>
                            <button className="btn btn-primary btn-lg" onClick={() => onFinish(formData)}>
                                Go to Sign In <ArrowRight size={18} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <style jsx>{`
                .onboarding-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(11, 12, 16, 0.95);
                    backdrop-filter: blur(10px);
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 24px;
                }
                .onboarding-card {
                    max-width: 560px;
                    width: 100%;
                    padding: 48px;
                    border: 1px solid rgba(185, 255, 44, 0.2);
                    box-shadow: 0 40px 100px rgba(0, 0, 0, 0.8);
                }
                .step-title {
                    font-family: var(--font-space-grotesk);
                    font-size: 2rem;
                    font-weight: 600;
                    margin-bottom: 8px;
                    color: var(--foreground);
                }
                .step-desc {
                    color: var(--muted-foreground);
                    font-size: 1.125rem;
                    margin-bottom: 32px;
                    max-width: 400px;
                }
            `}</style>
        </div>
    );
}
