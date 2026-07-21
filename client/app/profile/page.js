'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '../components/AuthGuard';

const API = 'http://localhost:5000';

function Toast({ toasts }) {
    return (
        <div className="toast-container">
            {toasts.map(t => (
                <div key={t.id} className={`toast toast-${t.type}`}>
                    {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ'} {t.message}
                </div>
            ))}
        </div>
    );
}

function FileSlot({ label, hint, fieldName, accept, existingName, onChange, icon }) {
    const [file, setFile] = useState(null);
    const handleChange = (e) => {
        const f = e.target.files[0];
        setFile(f);
        onChange(fieldName, f);
    };
    return (
        <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{icon}</span> {label}
            </label>
            <div className="file-upload" style={{ padding: '16px 20px' }}>
                <input type="file" accept={accept || '.pdf'} onChange={handleChange} id={`file-${fieldName}`} />
                <div className="upload-icon">{file ? '✅' : '📄'}</div>
                <div className="upload-text">
                    {file ? file.name : existingName ? `Current: ${existingName}` : 'Click or drag & drop'}
                </div>
                <div className="upload-hint">{hint || 'PDF only — max 5 MB'}</div>
            </div>
        </div>
    );
}

export default function ProfilePage() {
    const router = useRouter();
    const [form, setForm] = useState({
        name: '', email: '', linkedinUrl: '', githubUrl: '', portfolioUrl: '',
        resumeLink: '', techStack: '', experienceYears: 0, experienceMonths: 0, targetRoles: ''
    });
    const [files, setFiles] = useState({ resume: null, resume_genai: null, resume_backend: null });
    const [existing, setExisting] = useState(null);
    const [loading, setLoading] = useState(false);
    const [toasts, setToasts] = useState([]);

    const addToast = (message, type = 'info') => {
        const id = Date.now();
        setToasts(t => [...t, { id, message, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
    };

    const handleFileChange = (fieldName, file) => setFiles(f => ({ ...f, [fieldName]: file }));

    useEffect(() => {
        const saved = localStorage.getItem('jobreach_email');
        if (saved) {
            setForm(f => ({ ...f, email: saved }));
            fetch(`${API}/api/profile?email=${encodeURIComponent(saved)}`)
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                    if (d?.profile) {
                        setExisting(d.profile);
                        setForm({
                            name: d.profile.name,
                            email: d.profile.email,
                            linkedinUrl: d.profile.linkedinUrl || '',
                            githubUrl: d.profile.githubUrl || '',
                            portfolioUrl: d.profile.portfolioUrl || '',
                            resumeLink: d.profile.resumeLink || '',
                            techStack: d.profile.techStack || '',
                            experienceYears: d.profile.experienceYears || 0,
                            experienceMonths: d.profile.experienceMonths || 0,
                            targetRoles: d.profile.targetRoles || ''
                        });
                    }
                })
                .catch(() => { });
        }
    }, []);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!form.name || !form.email) { addToast('Name and email are required.', 'error'); return; }
        setLoading(true);
        try {
            const fd = new FormData();
            Object.entries(form).forEach(([k, v]) => fd.append(k, v));
            if (files.resume)         fd.append('resume',         files.resume);
            if (files.resume_genai)   fd.append('resume_genai',   files.resume_genai);
            if (files.resume_backend) fd.append('resume_backend',  files.resume_backend);

            const res = await fetch(`${API}/api/profile`, { method: 'POST', body: fd });
            const data = await res.json();
            if (res.ok) {
                localStorage.setItem('jobreach_email', form.email);
                setExisting(data.profile);
                if (data.optimizerSyncError) {
                    // The profile saved — say so, but don't claim the optimizer is ready.
                    addToast(`Profile saved, but the Resume Optimizer was not updated: ${data.optimizerSyncError}`, 'error');
                    setTimeout(() => router.push('/'), 4000);
                } else {
                    addToast('Profile saved! Resumes synced to AI Optimizer ✨', 'success');
                    setTimeout(() => router.push('/'), 1400);
                }
            } else {
                addToast(data.message || 'Failed to save profile.', 'error');
            }
        } catch (err) {
            console.error('Profile save failed:', err);
            addToast(`Could not save profile: ${err.message}. Make sure the server is running.`, 'error');
        }
        setLoading(false);
    }

    const optimizerReady = !!(existing?.resumeGenaiName && existing?.resumeBackendName);

    return (
        <AuthGuard>
            <main className="page">
                <div className="container" style={{ maxWidth: 640 }}>
                    <div className="page-header">
                        <h1>Your Profile</h1>
                        <p>Set up once — saved and used for every outreach automatically.</p>
                    </div>

                    {existing && (
                        <div className="alert alert-success" style={{ marginBottom: 24 }}>
                            ✅ Profile exists. Update any field below.
                        </div>
                    )}

                    <div className="card">
                        <form onSubmit={handleSubmit}>
                            {/* Basic Info */}
                            <div className="form-group">
                                <label>Full Name</label>
                                <input type="text" placeholder="Rajneesh Kumar" value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                            </div>

                            <div className="form-group">
                                <label>Your Gmail Address</label>
                                <input type="email" placeholder="rajneesh@gmail.com" value={form.email}
                                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>
                                    💡 Used as your sender identity and to look up your profile.
                                </div>
                            </div>

                            <div className="grid-2">
                                <div className="form-group">
                                    <label>LinkedIn URL *</label>
                                    <input type="url" placeholder="https://linkedin.com/in/..."
                                        value={form.linkedinUrl} onChange={e => setForm(f => ({ ...f, linkedinUrl: e.target.value }))} required />
                                </div>
                                <div className="form-group">
                                    <label>GitHub URL *</label>
                                    <input type="url" placeholder="https://github.com/..."
                                        value={form.githubUrl} onChange={e => setForm(f => ({ ...f, githubUrl: e.target.value }))} required />
                                </div>
                            </div>

                            <div className="grid-2">
                                <div className="form-group">
                                    <label>Portfolio URL *</label>
                                    <input type="url" placeholder="https://yourportfolio.com"
                                        value={form.portfolioUrl} onChange={e => setForm(f => ({ ...f, portfolioUrl: e.target.value }))} required />
                                </div>
                                <div className="form-group">
                                    <label>Experience</label>
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <input type="number" value={form.experienceYears} min="0"
                                                onChange={e => setForm(f => ({ ...f, experienceYears: e.target.value }))} />
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Yrs</span>
                                        </div>
                                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <input type="number" value={form.experienceMonths} min="0" max="11"
                                                onChange={e => setForm(f => ({ ...f, experienceMonths: e.target.value }))} />
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Mo</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Resume Link (Google Drive / Dropbox)</label>
                                <input type="url" placeholder="https://drive.google.com/..."
                                    value={form.resumeLink} onChange={e => setForm(f => ({ ...f, resumeLink: e.target.value }))} />
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>
                                    💡 This link is included in your outreach emails.
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Core Tech Stack</label>
                                <input type="text" placeholder="React, Node.js, TypeScript, etc."
                                    value={form.techStack} onChange={e => setForm(f => ({ ...f, techStack: e.target.value }))} />
                            </div>

                            <div className="form-group">
                                <label>Target Job Roles</label>
                                <input type="text" placeholder="Frontend Engineer, SDE-2, etc."
                                    value={form.targetRoles} onChange={e => setForm(f => ({ ...f, targetRoles: e.target.value }))} />
                            </div>

                            {/* ── Resumes Section ─────────────────────────────────── */}
                            <div style={{
                                marginTop: 32, marginBottom: 8, padding: '24px',
                                background: 'rgba(108,99,255,0.04)', borderRadius: 20,
                                border: '1px solid var(--border)', position: 'relative', overflow: 'hidden'
                            }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: 'var(--gradient)' }} />

                                <div style={{ marginBottom: 20 }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                                        🧬 AI Resume Optimizer — Upload Your Resumes
                                    </div>
                                    <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', margin: 0 }}>
                                        Upload both your role-specific resumes. The AI will automatically pick the best match for each job during Autopilot.
                                    </p>
                                </div>

                                {/* Optimizer status badge */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                                    background: optimizerReady ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
                                    borderRadius: 10, border: `1px solid ${optimizerReady ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
                                    marginBottom: 20, fontSize: '0.82rem',
                                }}>
                                    <span>{optimizerReady ? '✅' : '⚠️'}</span>
                                    <span style={{ color: optimizerReady ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                                        {optimizerReady
                                            ? `Optimizer ready — GenAI: ${existing.resumeGenaiName} | Backend: ${existing.resumeBackendName}`
                                            : 'Upload both resumes below to enable AI resume optimization'}
                                    </span>
                                </div>

                                <div className="grid-2">
                                    <FileSlot
                                        label="Gen AI / Frontend Resume"
                                        hint="Used for AI, ML, GenAI, or frontend roles"
                                        fieldName="resume_genai"
                                        icon="🤖"
                                        existingName={existing?.resumeGenaiName}
                                        onChange={handleFileChange}
                                    />
                                    <FileSlot
                                        label="Backend / Fullstack Resume"
                                        hint="Used for backend, infra, or fullstack roles"
                                        fieldName="resume_backend"
                                        icon="⚙️"
                                        existingName={existing?.resumeBackendName}
                                        onChange={handleFileChange}
                                    />
                                </div>
                            </div>

                            {/* Main resume (fallback) */}
                            <div className="form-group" style={{ marginTop: 8 }}>
                                <label>Main Resume PDF (email attachment fallback)</label>
                                <div className="file-upload">
                                    <input type="file" accept=".pdf,.doc,.docx"
                                        onChange={e => handleFileChange('resume', e.target.files[0])} />
                                    <div className="upload-icon">{files.resume ? '✅' : '📄'}</div>
                                    <div className="upload-text">
                                        {files.resume ? files.resume.name : existing?.resumeOriginalName ? `Current: ${existing.resumeOriginalName}` : 'Click or drag & drop your resume'}
                                    </div>
                                    <div className="upload-hint">PDF, DOC, DOCX — max 5 MB</div>
                                </div>
                            </div>

                            <div className="alert alert-info" style={{ marginTop: 8 }}>
                                <span>ℹ</span>
                                <span>Your resumes are stored on the server and synced to the AI Optimizer automatically on save.</span>
                            </div>

                            <button type="submit" className="btn btn-primary btn-full btn-lg"
                                style={{ marginTop: 24 }} disabled={loading}>
                                {loading ? <><span className="spinner" /> Saving...</> : '💾 Save Profile'}
                            </button>
                        </form>
                    </div>
                </div>
                <Toast toasts={toasts} />
            </main>
        </AuthGuard>
    );
}
