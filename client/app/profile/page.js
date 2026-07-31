'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Check, FileText, Globe, Loader2, Plus, Save, Sparkles, Trash2, Upload, User, Users,
} from 'lucide-react';
import AuthGuard from '../components/AuthGuard';
import BaseCvEditor from '../components/BaseCvEditor';
import { Alert, Badge, Button, Card, CardTitle, Field, Input, cn } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { apiDelete, apiGet, apiPost } from '@/lib/api';

/**
 * A file slot styled as a drop target. The underlying control stays a real
 * <input type="file"> so it remains keyboard- and screen-reader-accessible.
 */
function FileSlot({ label, hint, fieldName, accept, existingName, onChange, onDelete, icon: Icon }) {
    const [file, setFile] = useState(null);
    const [removing, setRemoving] = useState(false);
    const id = `file-${fieldName}`;
    const filled = Boolean(file || existingName);

    const handleChange = (e) => {
        const f = e.target.files[0];
        setFile(f);
        onChange(fieldName, f);
    };

    // Clearing the input's value matters: without it, re-picking the same
    // filename after a delete fires no change event and the upload is lost.
    const handleDelete = async () => {
        setRemoving(true);
        const cleared = await onDelete();
        if (cleared) {
            setFile(null);
            onChange(fieldName, null);
            const input = document.getElementById(id);
            if (input) input.value = '';
        }
        setRemoving(false);
    };

    return (
        <div className="mb-5">
            <label className="ui-label" htmlFor={id}>
                <span className="flex items-center gap-2">
                    {Icon && <Icon className="size-4 text-subtle" aria-hidden="true" />}
                    {label}
                </span>
            </label>
            <div
                className={cn(
                    'flex items-center gap-2 rounded-xl border border-dashed p-4 transition-colors',
                    filled ? 'border-brand/35 bg-brand/6' : 'border-white/15 bg-white/2 hover:border-brand/40',
                )}
            >
                <input id={id} type="file" accept={accept || '.pdf,.doc,.docx'} onChange={handleChange} className="sr-only" />
                <label htmlFor={id} className="tap flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <span
                        className={cn(
                            'grid size-10 shrink-0 place-items-center rounded-lg',
                            filled ? 'bg-brand/12 text-brand' : 'bg-white/5 text-subtle',
                        )}
                    >
                        {filled ? <Check className="size-5" aria-hidden="true" /> : <Upload className="size-5" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                            {file ? file.name : existingName || 'Click to upload'}
                        </span>
                        <span className="block text-xs text-subtle">{hint || 'PDF or Word — max 5 MB'}</span>
                    </span>
                </label>

                {existingName && (
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={removing}
                        aria-label={`Remove ${label}`}
                        title={`Remove ${label}`}
                        className="tap grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 text-subtle transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    >
                        {removing
                            ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            : <Trash2 className="size-4" aria-hidden="true" />}
                    </button>
                )}
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
    const [files, setFiles] = useState({ resume: null });
    const [teamMembers, setTeamMembers] = useState([]);
    const [newMember, setNewMember] = useState('');
    const [existing, setExisting] = useState(null);
    const [loading, setLoading] = useState(false);
    // Toasts come from the app-level provider (one aria-live region, dismissible).
    const { toast: addToast } = useToast();

    const handleFileChange = (fieldName, file) => setFiles(f => ({ ...f, [fieldName]: file }));

    /** Add an applier, ignoring duplicates so a name maps to exactly one person. */
    function addMember() {
        const name = newMember.trim();
        if (!name) return;
        if (teamMembers.some((m) => m.toLowerCase() === name.toLowerCase())) {
            addToast(`${name} is already on the list.`, 'error');
            return;
        }
        setTeamMembers((m) => [...m, name]);
        setNewMember('');
    }

    /** Remove an already-uploaded resume so the slot can be filled again. */
    async function handleFileDelete(slot) {
        try {
            const data = await apiDelete(`/api/profile/resume/${slot}`);
            setExisting(data.profile);
            addToast(
                data.optimizerSyncError
                    ? `Resume removed, but the CV optimiser was not updated: ${data.optimizerSyncError}`
                    : 'Resume removed.',
                data.optimizerSyncError ? 'error' : 'success',
            );
            return true;
        } catch (err) {
            addToast(err.message || 'Could not remove the resume.', 'error');
            return false;
        }
    }

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
                setTeamMembers((d.profile.teamMembers || []).map((m) => m.name));
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
            fd.append('teamMembers', JSON.stringify(teamMembers));
            if (files.resume)         fd.append('resume',         files.resume);

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
                            title="Your CV"
                            description="One CV. It is attached to your outgoing emails and is the document the optimiser tailors for each job, keeping your layout intact."
                            action={
                                existing?.resumeOriginalName
                                    ? <Badge tone="success" icon={Check}>Ready</Badge>
                                    : <Badge tone="warning">Needed</Badge>
                            }
                        />

                        <FileSlot
                            label="Base CV"
                            fieldName="resume"
                            hint="PDF or Word — tailored per job and attached to your emails."
                            existingName={existing?.resumeOriginalName}
                            onChange={handleFileChange}
                            onDelete={() => handleFileDelete('main')}
                            icon={FileText}
                        />

                        {!existing?.resumeOriginalName && (
                            <Alert tone="warning" className="mb-0">
                                Without a resume, emails and CVs are written from your profile fields alone
                                and will read generically.
                            </Alert>
                        )}
                    </Card>

                    {/* ── Who applies on your behalf ───────────────────────── */}
                    <Card className="mb-5">
                        <CardTitle
                            icon={Users}
                            accent="info"
                            title="Who applies on your behalf"
                            description="Everything sent stays yours — your resume, your name, your email. This only records who pressed send, so History can show how many applications each person made."
                        />

                        <div className="mb-4 flex gap-2">
                            <Input
                                aria-label="Name of person who applies on your behalf"
                                placeholder="e.g. Ansh"
                                value={newMember}
                                maxLength={60}
                                onChange={(e) => setNewMember(e.target.value)}
                                onKeyDown={(e) => {
                                    // Enter would otherwise submit the whole profile form.
                                    if (e.key === 'Enter') { e.preventDefault(); addMember(); }
                                }}
                            />
                            <Button type="button" variant="secondary" onClick={addMember} disabled={!newMember.trim()}>
                                <Plus className="size-4" aria-hidden="true" />
                                Add
                            </Button>
                        </div>

                        {teamMembers.length === 0 ? (
                            <p className="text-sm text-subtle">
                                No one yet — every application is recorded as yours.
                            </p>
                        ) : (
                            <ul className="flex flex-wrap gap-2">
                                {teamMembers.map((member) => (
                                    <li
                                        key={member}
                                        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/4 py-1 pl-3 pr-1 text-sm font-semibold"
                                    >
                                        {member}
                                        <button
                                            type="button"
                                            onClick={() => setTeamMembers((m) => m.filter((n) => n !== member))}
                                            aria-label={`Remove ${member}`}
                                            className="tap grid size-6 place-items-center rounded-full text-subtle transition-colors hover:bg-danger/15 hover:text-danger"
                                        >
                                            <Trash2 className="size-3.5" aria-hidden="true" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
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

                {/* Kept outside the profile form: it saves through its own
                    endpoint, so nesting it would tie two unrelated saves to one
                    submit button. */}
                <BaseCvEditor userEmail={existing?.email} />
            </div>
        </AuthGuard>
    );
}
