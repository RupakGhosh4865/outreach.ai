'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Check, FileText, Github, Globe, Linkedin, Save, Sparkles, Upload, User,
} from 'lucide-react';
import AuthGuard from '../components/AuthGuard';
import { Alert, Badge, Button, Card, CardTitle, Field, Input, cn } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { apiGet, apiPost } from '@/lib/api';

/**
 * A file slot styled as a drop target. The underlying control stays a real
 * <input type="file"> so it remains keyboard- and screen-reader-accessible.
 */
function FileSlot({ label, hint, fieldName, accept, existingName, onChange, icon: Icon }) {
    const [file, setFile] = useState(null);
    const id = `file-${fieldName}`;

    const handleChange = (e) => {
        const f = e.target.files[0];
        setFile(f);
        onChange(fieldName, f);
    };

    return (
        <div className="mb-5">
            <label className="ui-label" htmlFor={id}>
                <span className="flex items-center gap-2">
                    {Icon && <Icon className="size-4 text-subtle" aria-hidden="true" />}
                    {label}
                </span>
            </label>
            <input id={id} type="file" accept={accept || '.pdf'} onChange={handleChange} className="sr-only" />
            <label
                htmlFor={id}
                className={cn(
                    'tap flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 transition-colors',
                    file || existingName
                        ? 'border-brand/35 bg-brand/6'
                        : 'border-white/15 bg-white/2 hover:border-brand/40',
                )}
            >
                <span
                    className={cn(
                        'grid size-10 shrink-0 place-items-center rounded-lg',
                        file || existingName ? 'bg-brand/12 text-brand' : 'bg-white/5 text-subtle',
                    )}
                >
                    {file || existingName ? <Check className="size-5" aria-hidden="true" /> : <Upload className="size-5" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                        {file ? file.name : existingName ? existingName : 'Click to upload'}
                    </span>
                    <span className="block text-xs text-subtle">{hint || 'PDF only — max 5 MB'}</span>
                </span>
            </label>
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
    // Toasts come from the app-level provider (one aria-live region, dismissible).
    const { toast: addToast } = useToast();

    const handleFileChange = (fieldName, file) => setFiles(f => ({ ...f, [fieldName]: file }));

    useEffect(() => {
        // The server resolves the account from the token, so no email is sent.
        apiGet('/api/profile')
            .then(d => {
                if (!d?.profile) return;
                setExisting(d.profile);
                setForm({
                    name: d.profile.name || '',
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
                localStorage.setItem('jobreach_email', d.profile.email);
            })
            .catch(() => { /* no profile saved yet */ });
    }, []);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!form.name) { addToast('Name is required.', 'error'); return; }
        setLoading(true);
        try {
            const fd = new FormData();
            // `email` is intentionally not sent — the server takes the account
            // from the auth token, so it cannot be pointed at someone else.
            Object.entries(form)
                .filter(([k]) => k !== 'email')
                .forEach(([k, v]) => fd.append(k, v));
            if (files.resume)         fd.append('resume',         files.resume);
            if (files.resume_genai)   fd.append('resume_genai',   files.resume_genai);
            if (files.resume_backend) fd.append('resume_backend',  files.resume_backend);

            const data = await apiPost('/api/profile', fd);
            setExisting(data.profile);
            if (data.profile?.email) localStorage.setItem('jobreach_email', data.profile.email);

            if (data.optimizerSyncError) {
                // The profile saved — say so, but don't claim the optimizer is ready.
                addToast(`Profile saved, but the Resume Optimizer was not updated: ${data.optimizerSyncError}`, 'error');
                setTimeout(() => router.push('/'), 4000);
            } else {
                addToast('Profile saved. Resumes synced to the CV optimiser.', 'success');
                setTimeout(() => router.push('/'), 1400);
            }
        } catch (err) {
            console.error('Profile save failed:', err);
            addToast(err.message || 'Could not save profile.', 'error');
        }
        setLoading(false);
    }

    const optimizerReady = Boolean(existing?.resumeGenaiName && existing?.resumeBackendName);

    return (
        <AuthGuard>
            <div className="shell-narrow page-top pb-20">
                <header className="animate-fade-up mb-8">
                    <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Your profile</h1>
                    <p className="mt-2 text-muted">
                        This is what every generated CV and email is built from — the more you fill in, the
                        less generic they read.
                    </p>
                </header>

                <form onSubmit={handleSubmit} noValidate>
                    {/* ── Identity ─────────────────────────────────────────── */}
                    <Card className="mb-5">
                        <CardTitle icon={User} title="About you" />

                        <Field label="Full name" htmlFor="name" required>
                            <Input
                                id="name"
                                name="name"
                                autoComplete="name"
                                placeholder="Ada Lovelace"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                required
                            />
                        </Field>

                        <Field
                            label="Account email"
                            htmlFor="email"
                            hint="Set by the account you signed in with. Sign in with a different account to change it."
                        >
                            {/* Read-only: the account is fixed by how you signed in. This was
                                editable, which let a saved profile be pointed at another user. */}
                            <Input id="email" type="email" value={form.email} readOnly disabled />
                        </Field>

                        <div className="grid gap-x-4 sm:grid-cols-2">
                            <Field label="Years of experience" htmlFor="years">
                                <Input
                                    id="years"
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    max="50"
                                    value={form.experienceYears}
                                    onChange={(e) => setForm((f) => ({ ...f, experienceYears: e.target.value }))}
                                />
                            </Field>
                            <Field label="Additional months" htmlFor="months">
                                <Input
                                    id="months"
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    max="11"
                                    value={form.experienceMonths}
                                    onChange={(e) => setForm((f) => ({ ...f, experienceMonths: e.target.value }))}
                                />
                            </Field>
                        </div>

                        <Field label="Tech stack" htmlFor="stack" hint="Comma separated, most relevant first.">
                            <Input
                                id="stack"
                                placeholder="Node.js, React, PostgreSQL, AWS"
                                value={form.techStack}
                                onChange={(e) => setForm((f) => ({ ...f, techStack: e.target.value }))}
                            />
                        </Field>

                        <Field
                            label="Target roles"
                            htmlFor="roles"
                            hint="Job Radar scans for these, so be specific."
                            className="mb-0"
                        >
                            <Input
                                id="roles"
                                placeholder="Backend Engineer, Platform Engineer"
                                value={form.targetRoles}
                                onChange={(e) => setForm((f) => ({ ...f, targetRoles: e.target.value }))}
                            />
                        </Field>
                    </Card>

                    {/* ── Links ────────────────────────────────────────────── */}
                    <Card className="mb-5">
                        <CardTitle
                            icon={Globe}
                            accent="info"
                            title="Links"
                            description="Only the ones you fill in are ever mentioned in an email."
                        />

                        <Field label="LinkedIn" htmlFor="linkedin">
                            <Input
                                id="linkedin"
                                type="url"
                                inputMode="url"
                                placeholder="https://linkedin.com/in/..."
                                value={form.linkedinUrl}
                                onChange={(e) => setForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
                            />
                        </Field>
                        <Field label="GitHub" htmlFor="github">
                            <Input
                                id="github"
                                type="url"
                                inputMode="url"
                                placeholder="https://github.com/..."
                                value={form.githubUrl}
                                onChange={(e) => setForm((f) => ({ ...f, githubUrl: e.target.value }))}
                            />
                        </Field>
                        <Field label="Portfolio" htmlFor="portfolio">
                            <Input
                                id="portfolio"
                                type="url"
                                inputMode="url"
                                placeholder="https://yoursite.com"
                                value={form.portfolioUrl}
                                onChange={(e) => setForm((f) => ({ ...f, portfolioUrl: e.target.value }))}
                            />
                        </Field>
                        <Field
                            label="Resume link"
                            htmlFor="resume-link"
                            hint="A public link, if you'd rather share one than attach a file."
                            className="mb-0"
                        >
                            <Input
                                id="resume-link"
                                type="url"
                                inputMode="url"
                                placeholder="https://drive.google.com/..."
                                value={form.resumeLink}
                                onChange={(e) => setForm((f) => ({ ...f, resumeLink: e.target.value }))}
                            />
                        </Field>
                    </Card>

                    {/* ── Resumes ──────────────────────────────────────────── */}
                    <Card className="mb-5">
                        <CardTitle
                            icon={FileText}
                            accent="success"
                            title="Resumes"
                            description="The main one is attached to emails; the two role-specific ones feed the CV optimiser."
                            action={
                                optimizerReady
                                    ? <Badge tone="success" icon={Check}>Optimiser ready</Badge>
                                    : <Badge tone="warning">Optimiser needs both</Badge>
                            }
                        />

                        <FileSlot
                            label="Main resume"
                            fieldName="resume"
                            accept=".pdf,.doc,.docx"
                            hint="PDF, DOC or DOCX — attached to outgoing emails."
                            existingName={existing?.resumeOriginalName}
                            onChange={handleFileChange}
                            icon={FileText}
                        />
                        <FileSlot
                            label="Gen AI resume"
                            fieldName="resume_genai"
                            hint="PDF only — the optimiser cannot read Word files."
                            existingName={existing?.resumeGenaiName}
                            onChange={handleFileChange}
                            icon={Sparkles}
                        />
                        <FileSlot
                            label="Backend resume"
                            fieldName="resume_backend"
                            hint="PDF only — the optimiser cannot read Word files."
                            existingName={existing?.resumeBackendName}
                            onChange={handleFileChange}
                            icon={FileText}
                        />

                        {!existing?.resumeOriginalName && (
                            <Alert tone="warning" className="mb-0">
                                Without a resume, emails and CVs are written from your profile fields alone
                                and will read generically.
                            </Alert>
                        )}
                    </Card>

                    {/* Sticky on mobile so Save is always reachable in a long form. */}
                    <div className="sticky bottom-0 -mx-4 border-t border-white/8 bg-bg/90 px-4 py-4 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
                        <Button type="submit" size="lg" block loading={loading} disabled={loading}>
                            {!loading && <Save className="size-4" aria-hidden="true" />}
                            Save profile
                        </Button>
                    </div>
                </form>
            </div>
        </AuthGuard>
    );
}
