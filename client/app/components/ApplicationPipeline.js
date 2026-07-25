'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    AlertCircle, Check, CheckCircle2, CircleDashed, FileText, Loader2, Minus,
    RotateCcw, Send, Workflow, X,
} from 'lucide-react';
import { Alert, Badge, Button, Card, CardTitle, Field, Input, Textarea, cn } from './ui';
import { apiGet, apiPost, downloadAuthedFile, openAuthedFile } from '@/lib/api';

const STEP_LABELS = {
    generate_cv: 'Build job-matched CV',
    find_contacts: 'Find hiring contacts',
    generate_email: 'Write outreach email',
    send_email: 'Send email',
};

/* Status is carried by an icon as well as colour, so it survives a colour-vision
   difference and a greyscale screenshot. */
const STEP_ICON = {
    pending: CircleDashed,
    running: Loader2,
    done: Check,
    error: X,
    skipped: Minus,
};

const STEP_TONE = {
    pending: 'text-subtle',
    running: 'text-info',
    done: 'text-success',
    error: 'text-danger',
    skipped: 'text-subtle',
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

                                {/* Step rail */}
                                <ol className="mb-3 space-y-1.5">
                                    {(app.steps || []).map((step) => {
                                        const Icon = STEP_ICON[step.status] || CircleDashed;
                                        return (
                                            <li key={step.name} className="flex items-start gap-2.5 text-sm">
                                                <Icon
                                                    className={cn(
                                                        'mt-0.5 size-4 shrink-0',
                                                        STEP_TONE[step.status],
                                                        step.status === 'running' && 'animate-spin',
                                                    )}
                                                    aria-hidden="true"
                                                />
                                                <span className={step.status === 'pending' ? 'text-subtle' : 'text-muted'}>
                                                    {STEP_LABELS[step.name] || step.name}
                                                    {step.name === 'send_email' && !app.autoSend && step.status === 'pending' && (
                                                        <span className="text-subtle"> (waits for your review)</span>
                                                    )}
                                                    {step.error && (
                                                        <span className="mt-0.5 block text-xs text-danger">{step.error}</span>
                                                    )}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ol>

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
                                        <p className="text-xs text-subtle">
                                            To: {(app.contacts || []).map((c) => c.email).join(', ') || 'no recipients found'}
                                        </p>
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
