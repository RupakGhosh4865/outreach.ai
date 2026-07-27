'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Check, CheckCircle2, CircleDashed, FileText, Loader2, Mail, Minus, Plus,
    RotateCcw, Send, Sparkles, Trash2, Users, Workflow, X,
} from 'lucide-react';
import { Alert, Badge, Button, Card, CardTitle, Field, Input, Textarea, cn } from './ui';
import { apiDelete, apiGet, apiPost, downloadAuthedFile, openAuthedFile } from '@/lib/api';

const STEP_LABELS = {
    generate_cv: 'Build job-matched CV',
    find_contacts: 'Find hiring contacts',
    generate_email: 'Write outreach email',
    send_email: 'Send email',
};

/* Mirrors the autopilot stepper on the same page: an icon and a one-line
   description per stage, so both routes into an application read the same. */
const STEP_META = {
    generate_cv: { icon: FileText, desc: 'Rewriting your CV to match this job description.' },
    find_contacts: { icon: Users, desc: 'Looking for hiring managers and decision makers.' },
    generate_email: { icon: Sparkles, desc: 'Drafting personalised outreach copy.' },
    send_email: { icon: Send, desc: 'Waiting for your review before anything goes out.' },
};

const STATUS_LABEL = {
    ready: 'Ready to apply',
    applying: 'Waiting for your approval',
    approved: 'Starting…',
    cv_generating: 'Building your CV…',
    cv_generated: 'CV ready',
    cv_failed: 'CV failed',
    contacts_found: 'Contacts found',
    email_drafted: 'Draft ready — review & send',
    emailing: 'Sending…',
    emailed: 'Sent',
    email_failed: 'Send failed',
    denied: 'Denied',
};

const STATUS_TONE = {
    emailed: 'success',
    cv_failed: 'danger',
    email_failed: 'danger',
    denied: 'neutral',
    email_drafted: 'brand',
};

const ACTIVE_STATUSES = ['approved', 'cv_generating', 'cv_generated', 'contacts_found', 'emailing'];

/**
 * Recipient list with an inline add field.
 *
 * Automated contact discovery fails routinely — small companies, no published
 * addresses — and when it did the application simply stopped, with an error that
 * asked for a manual recipient but no way to enter one. This is that way.
 */
function RecipientEditor({ app, busy, onAdd, onRemove }) {
    const [email, setEmail] = useState('');
    const [adding, setAdding] = useState(false);
    const contacts = app.contacts || [];
    const inputId = `recipient-${app._id}`;

    const submit = async () => {
        const value = email.trim();
        if (!value) return;
        setAdding(true);
        const ok = await onAdd(value);
        if (ok) setEmail('');
        setAdding(false);
    };

    return (
        <div className="mb-3 rounded-xl border border-white/8 bg-white/2 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-subtle">
                <Mail className="size-3.5" aria-hidden="true" />
                Recipients
            </p>

            {contacts.length > 0 ? (
                <ul className="mb-3 flex flex-wrap gap-1.5">
                    {contacts.map((c) => (
                        <li
                            key={c.email}
                            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/4 py-1 pl-2.5 pr-1 text-xs"
                        >
                            <span className="max-w-52 truncate">{c.email}</span>
                            {c.source === 'manual' && <span className="text-[0.65rem] text-subtle">added by you</span>}
                            <button
                                type="button"
                                onClick={() => onRemove(c.email)}
                                disabled={busy}
                                aria-label={`Remove ${c.email}`}
                                className="tap grid size-5 place-items-center rounded-full text-subtle transition-colors hover:bg-danger/15 hover:text-danger disabled:opacity-50"
                            >
                                <Trash2 className="size-3" aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mb-3 text-xs text-subtle">
                    No contacts found automatically. Add an address to carry on — the CV is already built.
                </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
                <label className="sr-only" htmlFor={inputId}>Recipient email address</label>
                <Input
                    id={inputId}
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    placeholder="hiring@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
                />
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={adding}
                    disabled={adding || busy || !email.trim()}
                    onClick={submit}
                    className="sm:w-36"
                >
                    {!adding && <Plus className="size-3.5" aria-hidden="true" />}
                    Add recipient
                </Button>
            </div>
        </div>
    );
}

/** Live view of every application in flight, with per-step progress and retries. */
export default function ApplicationPipeline({ userEmail, isExtension, refreshKey }) {
    const [applications, setApplications] = useState([]);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState('');
    const [editing, setEditing] = useState({}); // appId -> { subject, body }
    const pollRef = useRef(null);

    const load = useCallback(async () => {
        if (!userEmail) return;
        try {
            const data = await apiGet('/api/applications');
            setApplications(data.applications || []);
            setError('');
        } catch (e) {
            setError(e.message);
        }
    }, [userEmail]);

    useEffect(() => { load(); }, [load, refreshKey]);

    // Poll only while something is actually moving.
    useEffect(() => {
        const active = applications.some(
            (a) => a.isRunning || ACTIVE_STATUSES.includes(a.status) || a.steps?.some((s) => s.status === 'running'),
        );
        clearInterval(pollRef.current);
        if (active) pollRef.current = setInterval(load, 2500);
        return () => clearInterval(pollRef.current);
    }, [applications, load]);

    async function act(app, path, body) {
        setBusyId(app._id);
        setError('');
        try {
            const data = await apiPost(`/api/applications/${app._id}${path}`, body || {});
            await load();
            return data;
        } catch (e) {
            setError(e.message);
        } finally {
            setBusyId('');
        }
    }

    async function remove(app, email) {
        setBusyId(app._id);
        setError('');
        try {
            await apiDelete(`/api/applications/${app._id}/contacts/${encodeURIComponent(email)}`);
            await load();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusyId('');
        }
    }

    async function viewCv(app) {
        setError('');
        const path = `/api/applications/${app._id}/cv`;
        const name = `CV_${(app.companyName || 'Application').replace(/[^\w-]+/g, '_')}.pdf`;
        try {
            const opened = await openAuthedFile(path);
            if (!opened) await downloadAuthedFile(path, name);
        } catch (e) {
            setError(e.message || 'Could not open the CV.');
        }
    }

    const visible = applications.filter((a) => !['ready', 'found', 'validating'].includes(a.status));

    if (!userEmail) return null;

    return (
        <Card className="mb-4">
            <CardTitle
                icon={Workflow}
                accent="success"
                title="Application pipeline"
                description="Everything currently in flight."
                action={
                    <Button type="button" variant="ghost" size="sm" onClick={load}>
                        <RotateCcw className="size-3.5" aria-hidden="true" />
                        <span className="sr-only sm:not-sr-only">Refresh</span>
                    </Button>
                }
            />

            {error && <Alert tone="danger" className="mb-4">{error}</Alert>}

            {visible.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-subtle">
                    Nothing in flight. Hit <strong className="text-muted">Apply now</strong> on a job, finish on the
                    company&apos;s site, then <strong className="text-muted">Approve</strong> — the agent takes it from there.
                </p>
            ) : (
                <ul className="space-y-3">
                    {visible.map((app) => {
                        const busy = busyId === app._id;
                        const failed = app.steps?.find((s) => s.status === 'error');
                        const draft = editing[app._id] || { subject: app.email?.subject || '', body: app.email?.body || '' };
                        const canSend = ['email_drafted', 'email_failed'].includes(app.status);
                        const steps = app.steps || [];
                        const total = steps.length;
                        const done = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
                        // Offer the recipient editor whenever contact discovery
                        // stalled, and while a draft is open so more people can be
                        // added before it goes out. Never once it has been sent —
                        // the server refuses those edits anyway.
                        const settled = ['emailed', 'denied'].includes(app.status);
                        const needsRecipient =
                            !settled && (failed?.name === 'find_contacts' || !app.contacts?.length || canSend);

                        return (
                            <li key={app._id} className="rounded-xl border border-white/8 bg-white/2 p-4">
                                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate font-bold">{app.jobTitle || 'Untitled role'}</p>
                                        <p className="mt-0.5 truncate text-sm text-subtle">
                                            {app.companyName || 'Unknown company'}
                                            {app.cv?.matchScore ? ` · ${app.cv.matchScore}% match` : ''}
                                            {app.contacts?.length ? ` · ${app.contacts.length} contact(s)` : ''}
                                        </p>
                                    </div>
                                    <Badge tone={STATUS_TONE[app.status] || 'info'}>
                                        {STATUS_LABEL[app.status] || app.status}
                                    </Badge>
                                </div>

                                {/* Step rail, styled to match the autopilot stepper. */}
                                <div className="mb-3 rounded-2xl border border-white/8 bg-white/2 p-3 sm:p-4" aria-live="polite">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <p className="text-sm font-bold">
                                            {failed ? 'Needs your input' : done === total ? 'Ready for review' : 'Working on it…'}
                                        </p>
                                        <span className="text-xs font-semibold text-subtle" data-numeric>
                                            Step {Math.min(done + (failed ? 0 : 1), total)} of {total}
                                        </span>
                                    </div>

                                    <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/8">
                                        <div
                                            className={cn(
                                                'h-full rounded-full transition-[width] duration-500 ease-out',
                                                failed ? 'bg-danger' : 'bg-brand',
                                            )}
                                            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
                                        />
                                    </div>

                                    <ol className="space-y-1.5">
                                        {(app.steps || []).map((step) => {
                                            const meta = STEP_META[step.name] || {};
                                            const StageIcon = meta.icon || CircleDashed;
                                            const active = step.status === 'running' || step.status === 'error';
                                            const isDone = step.status === 'done';
                                            const waiting = step.name === 'send_email' && !app.autoSend && step.status === 'pending';

                                            return (
                                                <li
                                                    key={step.name}
                                                    className={cn(
                                                        'flex items-start gap-3 rounded-lg px-2 py-1.5 transition-colors duration-300',
                                                        step.status === 'running' && 'bg-brand/8',
                                                        step.status === 'error' && 'bg-danger/8',
                                                        step.status === 'pending' && !waiting && 'opacity-45',
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full',
                                                            isDone && 'bg-brand text-brand-ink',
                                                            step.status === 'error' && 'text-danger',
                                                            step.status === 'running' && 'text-brand',
                                                            step.status === 'pending' && 'text-subtle',
                                                        )}
                                                    >
                                                        {isDone && <Check className="size-3" aria-hidden="true" />}
                                                        {step.status === 'error' && <X className="size-4" aria-hidden="true" />}
                                                        {step.status === 'running' && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                                                        {step.status === 'skipped' && <Minus className="size-4" aria-hidden="true" />}
                                                        {step.status === 'pending' && <StageIcon className="size-4" aria-hidden="true" />}
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className={cn('block text-sm font-semibold', active ? 'text-text' : 'text-muted')}>
                                                            {STEP_LABELS[step.name] || step.name}
                                                            {waiting && <span className="font-normal text-subtle"> (waits for your review)</span>}
                                                        </span>
                                                        {step.error
                                                            ? <span className="block text-xs text-danger">{step.error}</span>
                                                            : step.status === 'running' && meta.desc
                                                                ? <span className="block text-xs text-subtle">{meta.desc}</span>
                                                                : null}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ol>
                                </div>

                                {/* Recipients. Contact discovery fails often, and this is the
                                    only way past it — the pipeline's own error asks for a
                                    recipient, so the field to supply one belongs right here. */}
                                {needsRecipient && (
                                    <RecipientEditor
                                        app={app}
                                        busy={busy}
                                        onAdd={(email) => act(app, '/contacts', { email })}
                                        onRemove={(email) => remove(app, email)}
                                    />
                                )}

                                {/* Draft review */}
                                {canSend && (
                                    <div className="mb-3 space-y-3 border-t border-white/8 pt-3">
                                        <Field label="Subject" htmlFor={`subject-${app._id}`} className="mb-0">
                                            <Input
                                                id={`subject-${app._id}`}
                                                value={draft.subject}
                                                onChange={(e) => setEditing((p) => ({ ...p, [app._id]: { ...draft, subject: e.target.value } }))}
                                            />
                                        </Field>
                                        <Field label="Body" htmlFor={`body-${app._id}`} className="mb-0">
                                            <Textarea
                                                id={`body-${app._id}`}
                                                value={draft.body}
                                                onChange={(e) => setEditing((p) => ({ ...p, [app._id]: { ...draft, body: e.target.value } }))}
                                                className="min-h-40 font-mono text-[0.85rem]"
                                            />
                                        </Field>
                                    </div>
                                )}

                                {app.email?.sentAt && (
                                    <p className="mb-3 text-xs text-subtle">
                                        Sent <time dateTime={app.email.sentAt}>{new Date(app.email.sentAt).toLocaleString()}</time>
                                        {' '}to {(app.email.to || []).join(', ')}
                                        {app.email.attachmentStatus === 'missing' && (
                                            <span className="text-warning"> · no resume attached</span>
                                        )}
                                    </p>
                                )}

                                <div className="flex flex-wrap gap-2">
                                    {app.cv?.pdfPath && (
                                        /* Fetched with the auth header rather than linked
                                           directly — a browser navigation can't send one. */
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => viewCv(app)}
                                        >
                                            <FileText className="size-3.5" aria-hidden="true" />
                                            View CV
                                        </Button>
                                    )}
                                    {canSend && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            loading={busy}
                                            disabled={busy || !app.contacts?.length}
                                            onClick={() => act(app, '/send', { subject: draft.subject, body: draft.body })}
                                        >
                                            {!busy && <Send className="size-3.5" aria-hidden="true" />}
                                            Review &amp; send
                                        </Button>
                                    )}
                                    {failed && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            loading={busy}
                                            disabled={busy}
                                            onClick={() => act(app, '/retry', { step: failed.name })}
                                        >
                                            {!busy && <RotateCcw className="size-3.5" aria-hidden="true" />}
                                            Retry {STEP_LABELS[failed.name] || failed.name}
                                        </Button>
                                    )}
                                    {app.status === 'applying' && (
                                        <>
                                            <Button type="button" size="sm" disabled={busy} onClick={() => act(app, '/approve', { autoSend: false })}>
                                                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                                                Approve
                                            </Button>
                                            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => act(app, '/deny')}>
                                                Deny
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}
