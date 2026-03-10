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
            <div className="onboarding-card">
                <div className="stepper">
                    {steps.map((s, i) => (
                        <div key={s.id} className="step-item">
                            <div className={`step-circle ${step === s.id ? 'active' : step > s.id ? 'done' : ''}`}>
                                {step > s.id ? <CheckCircle size={14} /> : <span className="text-[10px] font-bold">{s.id}</span>}
                            </div>
                            <div className={`step-label ${step === s.id ? 'active' : ''}`}>{s.title}</div>
                            {i < steps.length - 1 && <div className={`step-line ${step > s.id ? 'done' : ''}`} />}
                        </div>
                    ))}
                </div>

                {step === 1 && (
                    <div className="onboarding-step">
                        <h2 className="step-title">Let&apos;s get started</h2>
                        <p className="step-desc">First, what should we call you?</p>
                        <div className="form-group">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-[#A8E063] mb-2 block">Full Name</label>
                            <input
                                type="text"
                                className="w-full bg-[#060D18] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-[#A8E063] outline-none transition-all"
                                placeholder="Jane Doe"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                autoFocus
                            />
                        </div>
                        <button className="w-full py-4 bg-[#A8E063] hover:bg-[#7EC63A] text-[#060D18] font-bold rounded-lg transition-all flex items-center justify-center gap-2 mt-8 disabled:opacity-50" onClick={nextStep} disabled={!formData.name}>
                            Continue <ArrowRight size={18} />
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div className="onboarding-step">
                        <h2 className="step-title">What&apos;s your focus?</h2>
                        <p className="step-desc">We&apos;ll tailor your outreach based on your role.</p>

                        <div className="grid grid-cols-2 gap-4 mb-8">
                            <label className={`cursor-pointer p-4 rounded-xl border transition-all ${formData.roleType === 'tech' ? 'bg-[#A8E063]/10 border-[#A8E063]' : 'bg-[#060D18] border-white/10 opacity-40 hover:opacity-100'}`}>
                                <input type="radio" className="hidden" name="role" checked={formData.roleType === 'tech'} onChange={() => setFormData({ ...formData, roleType: 'tech' })} />
                                <div className="text-xl mb-1">💻</div>
                                <div className="text-sm font-bold text-white">Tech</div>
                            </label>
                            <label className={`cursor-pointer p-4 rounded-xl border transition-all ${formData.roleType === 'nontech' ? 'bg-[#A8E063]/10 border-[#A8E063]' : 'bg-[#060D18] border-white/10 opacity-40 hover:opacity-100'}`}>
                                <input type="radio" className="hidden" name="role" checked={formData.roleType === 'nontech'} onChange={() => setFormData({ ...formData, roleType: 'nontech' })} />
                                <div className="text-xl mb-1">🤝</div>
                                <div className="text-sm font-bold text-white">Non-Tech</div>
                            </label>
                        </div>

                        <div className="form-group mb-8">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-[#A8E063] mb-2 block">Target Role</label>
                            <input
                                type="text"
                                className="w-full bg-[#060D18] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-[#A8E063] outline-none transition-all"
                                placeholder="e.g. Senior Frontend Developer"
                                value={formData.targetRole}
                                onChange={e => setFormData({ ...formData, targetRole: e.target.value })}
                            />
                        </div>

                        <div className="flex gap-4">
                            <button className="flex-1 py-4 border border-white/10 text-white font-bold rounded-lg hover:bg-white/5 transition-all" onClick={prevStep}>Back</button>
                            <button className="flex-1 py-4 bg-[#A8E063] hover:bg-[#7EC63A] text-[#060D18] font-bold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50" onClick={nextStep} disabled={!formData.targetRole}>
                                Move On <ArrowRight size={18} />
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="onboarding-step">
                        <h2 className="step-title">Upload your resume</h2>
                        <p className="step-desc">Our AI will parse this to write better emails (Optional).</p>

                        <div className="relative border-2 border-dashed border-white/10 rounded-2xl p-10 text-center hover:border-[#A8E063]/40 transition-all cursor-pointer bg-[#060D18]/40 mb-8">
                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setFormData({ ...formData, resume: e.target.files[0] })} />
                            <div className="text-3xl mb-4">📄</div>
                            <div className="text-sm font-bold text-white mb-1">{formData.resume ? formData.resume.name : 'Drop your resume here'}</div>
                            <div className="text-xs text-white/20 uppercase tracking-widest font-bold">PDF or Word, max 5MB</div>
                        </div>

                        <div className="flex gap-4">
                            <button className="flex-1 py-4 border border-white/10 text-white font-bold rounded-lg hover:bg-white/5 transition-all" onClick={prevStep}>Back</button>
                            <button className="flex-1 py-4 bg-[#A8E063] hover:bg-[#7EC63A] text-[#060D18] font-bold rounded-lg transition-all flex items-center justify-center gap-2" onClick={nextStep}>
                                {formData.resume ? 'Resume Attached' : 'Skip for now'} <ArrowRight size={18} />
                            </button>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div className="onboarding-step text-center">
                        <div className="w-20 h-20 rounded-full bg-[#A8E063]/10 flex items-center justify-center text-[#A8E063] mx-auto mb-8">
                            <Sparkles size={40} />
                        </div>
                        <h2 className="step-title">You&apos;re all set!</h2>
                        <p className="step-desc" style={{ maxWidth: 'unset' }}>
                            We&apos;ve prepared your profile. Now, sign in with Google or LinkedIn to finalize your account and start your outreach.
                        </p>

                        <button className="w-full py-5 bg-[#A8E063] hover:bg-[#7EC63A] text-[#060D18] font-bold rounded-lg transition-all flex items-center justify-center gap-2 text-lg hover:shadow-[0_8px_30px_rgba(168,224,99,0.3)]" onClick={() => onFinish(formData)}>
                            Go to Sign In <ArrowRight size={20} />
                        </button>
                    </div>
                )}
            </div>

            <style jsx>{`
                .onboarding-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(6, 13, 24, 0.98);
                    backdrop-filter: blur(12px);
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 24px;
                }
                .onboarding-card {
                    max-width: 520px;
                    width: 100%;
                    padding: 48px;
                    background: #0F2137;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 24px;
                    box-shadow: 0 40px 100px rgba(0, 0, 0, 0.5);
                }
                .stepper {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 48px;
                }
                .step-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                    flex: 1;
                    position: relative;
                }
                .step-circle {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.05);
                    color: rgba(255, 255, 255, 0.2);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    z-index: 2;
                }
                .step-circle.active {
                    background: #A8E063;
                    color: #060D18;
                    box-shadow: 0 0 15px rgba(168, 224, 99, 0.4);
                }
                .step-circle.done {
                    background: #1a2e4d;
                    color: #A8E063;
                    border-color: #A8E063/20;
                }
                .step-label {
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: rgba(255, 255, 255, 0.2);
                }
                .step-label.active {
                    color: #A8E063;
                }
                .step-line {
                    position: absolute;
                    top: 12px;
                    left: 50%;
                    width: 100%;
                    height: 1px;
                    background: rgba(255, 255, 255, 0.05);
                    z-index: 1;
                }
                .step-line.done {
                    background: #A8E063/20;
                }
            `}</style>
        </div>
    );
}
