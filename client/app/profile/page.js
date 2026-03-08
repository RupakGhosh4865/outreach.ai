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

export default function ProfilePage() {
    const router = useRouter();
    const [form, setForm] = useState({
        name: '',
        email: '',
        linkedinUrl: '',
        githubUrl: '',
        portfolioUrl: '',
        techStack: '',
        experienceYears: 0,
        targetRoles: ''
    });
    const [file, setFile] = useState(null);
    const [existing, setExisting] = useState(null);
    const [loading, setLoading] = useState(false);
    const [toasts, setToasts] = useState([]);

    const addToast = (message, type = 'info') => {
        const id = Date.now();
        setToasts(t => [...t, { id, message, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
    };

    // Pre-fill if email saved in localStorage
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
                            techStack: d.profile.techStack || '',
                            experienceYears: d.profile.experienceYears || 0,
                            targetRoles: d.profile.targetRoles || ''
                        });
                    }
                })
                .catch(() => { });
        }
    }, []);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!form.name || !form.email) {
            addToast('Name and email are required.', 'error');
            return;
        }
        setLoading(true);
        try {
            const fd = new FormData();
            fd.append('name', form.name);
            fd.append('email', form.email);
            fd.append('linkedinUrl', form.linkedinUrl);
            fd.append('githubUrl', form.githubUrl);
            fd.append('portfolioUrl', form.portfolioUrl);
            fd.append('techStack', form.techStack);
            fd.append('experienceYears', form.experienceYears);
            fd.append('targetRoles', form.targetRoles);
            if (file) fd.append('resume', file);

            const res = await fetch(`${API}/api/profile`, { method: 'POST', body: fd });
            const data = await res.json();

            if (res.ok) {
                localStorage.setItem('jobreach_email', form.email);
                addToast('Profile saved successfully!', 'success');
                setExisting(data.profile);
                setTimeout(() => router.push('/'), 1200);
            } else {
                addToast(data.message || 'Failed to save profile.', 'error');
            }
        } catch {
            addToast('Could not connect to server. Make sure it is running.', 'error');
        }
        setLoading(false);
    }

    return (
        <AuthGuard>
            <main className="page">
                <div className="container" style={{ maxWidth: 600 }}>
                    <div className="page-header">
                        <h1>Your Profile</h1>
                        <p>Set up once — your name, email, and resume are saved and used for every outreach.</p>
                    </div>

                    {existing && (
                        <div className="alert alert-success" style={{ marginBottom: 24 }}>
                            ✅ Profile exists. You can update any field below.
                        </div>
                    )}

                    <div className="card">
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Full Name</label>
                                <input
                                    type="text"
                                    placeholder="Rajneesh Kumar"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Your Gmail Address</label>
                                <input
                                    type="email"
                                    placeholder="rajneesh@gmail.com"
                                    value={form.email}
                                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                    required
                                />
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>
                                    💡 Used as your sender identity and to look up your profile later.
                                </div>
                            </div>

                            <div className="grid-2">
                                <div className="form-group">
                                    <label>LinkedIn URL *</label>
                                    <input
                                        type="url"
                                        placeholder="https://linkedin.com/in/..."
                                        value={form.linkedinUrl}
                                        onChange={e => setForm(f => ({ ...f, linkedinUrl: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>GitHub URL *</label>
                                    <input
                                        type="url"
                                        placeholder="https://github.com/..."
                                        value={form.githubUrl}
                                        onChange={e => setForm(f => ({ ...f, githubUrl: e.target.value }))}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid-2">
                                <div className="form-group">
                                    <label>Portfolio / Profile URL *</label>
                                    <input
                                        type="url"
                                        placeholder="https://yourportfolio.com"
                                        value={form.portfolioUrl}
                                        onChange={e => setForm(f => ({ ...f, portfolioUrl: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Years of Experience</label>
                                    <input
                                        type="number"
                                        value={form.experienceYears}
                                        onChange={e => setForm(f => ({ ...f, experienceYears: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Core Tech Stack</label>
                                <input
                                    type="text"
                                    placeholder="React, Node.js, TypeScript, etc."
                                    value={form.techStack}
                                    onChange={e => setForm(f => ({ ...f, techStack: e.target.value }))}
                                />
                            </div>

                            <div className="form-group">
                                <label>Target Job Roles</label>
                                <input
                                    type="text"
                                    placeholder="Frontend Engineer, SDE-2, etc."
                                    value={form.targetRoles}
                                    onChange={e => setForm(f => ({ ...f, targetRoles: e.target.value }))}
                                />
                            </div>

                            <div className="form-group">
                                <label>Resume (PDF)</label>
                                <div className="file-upload">
                                    <input
                                        type="file"
                                        accept=".pdf,.doc,.docx"
                                        onChange={e => setFile(e.target.files[0])}
                                    />
                                    <div className="upload-icon">📄</div>
                                    <div className="upload-text">
                                        {file ? file.name : 'Click or drag & drop your resume'}
                                    </div>
                                    <div className="upload-hint">PDF, DOC, DOCX — max 5 MB</div>
                                    {existing?.resumeOriginalName && !file && (
                                        <div className="uploaded-name">Currently saved: {existing.resumeOriginalName}</div>
                                    )}
                                </div>
                            </div>

                            <div className="alert alert-info" style={{ marginTop: 8 }}>
                                <span>ℹ</span>
                                <span>Your resume is stored on the server and used by AI to write personalized emails matching the job requirements.</span>
                            </div>

                            <button
                                type="submit"
                                className="btn btn-primary btn-full btn-lg"
                                style={{ marginTop: 24 }}
                                disabled={loading}
                            >
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
