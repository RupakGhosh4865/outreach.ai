'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

const STEP_LABELS = {
    generate_cv: 'Build job-matched CV',
    find_contacts: 'Find hiring contacts',
    generate_email: 'Write outreach email',
    send_email: 'Send email',
};

const STEP_ICON = { pending: '○', running: '◍', done: '✓', error: '✕', skipped: '–' };
const STEP_COLOR = { pending: 'var(--text-muted)', running: '#60a5fa', done: '#34d399', error: '#f87171', skipped: 'var(--text-muted)' };

const STATUS_LABEL = {
    ready: 'Ready to apply',
    applying: 'Waiting for you to approve',
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

const ACTIVE_STATUSES = ['approved', 'cv_generating', 'cv_generated', 'contacts_found', 'emailing'];

/** Live view of every application in flight, with per-step progress and retries. */
export default function ApplicationPipeline({ apiBase, userEmail, isExtension, refreshKey }) {
    const [applications, setApplications] = useState([]);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState('');
    const [editing, setEditing] = useState({}); // appId -> { subject, body }
    const pollRef = useRef(null);

    const load = useCallback(async () => {
        if (!userEmail) return;
        try {
            const res = await fetch(`${apiBase}/api/applications?userEmail=${encodeURIComponent(userEmail)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Could not load applications');
            setApplications(data.applications || []);
        } catch (e) {
            setError(e.message);
        }
    }, [apiBase, userEmail]);

    useEffect(() => { load(); }, [load, refreshKey]);

    // Poll only while something is actually moving.
    useEffect(() => {
        const active = applications.some(
            (a) => a.isRunning || ACTIVE_STATUSES.includes(a.status) || a.steps?.some((s) => s.status === 'running')
        );
        clearInterval(pollRef.current);
        if (active) pollRef.current = setInterval(load, 2500);
        return () => clearInterval(pollRef.current);
    }, [applications, load]);

    async function act(app, path, body) {
        setBusyId(app._id);
        setError('');
        try {
            const res = await fetch(`${apiBase}/api/applications/${app._id}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body || {}),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Request failed');
            await load();
            return data;
        } catch (e) {
            setError(e.message);
        } finally {
            setBusyId('');
        }
    }

    const visible = applications.filter((a) => !['ready', 'found', 'validating'].includes(a.status));

    if (!userEmail) return null;

    return (
        <div className="form-group" style={{ marginBottom: 32, padding: 24, background: 'rgba(52,211,153,0.04)', borderRadius: 20, border: '1px solid rgba(52,211,153,0.15)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#34d399' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <label style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                    ⚡ Application Pipeline
                </label>
                <button type="button" onClick={load} className="btn btn-secondary btn-sm">↻ Refresh</button>
            </div>

            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

            {visible.length === 0 && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Nothing in flight. Click <strong>Apply Now</strong> on a job, finish the application on the
                    company&apos;s site, then hit <strong>Approve</strong> — the agent takes it from there.
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {visible.map((app) => {
                    const busy = busyId === app._id;
                    const failed = app.steps?.find((s) => s.status === 'error');
                    const draft = editing[app._id] || { subject: app.email?.subject || '', body: app.email?.body || '' };
                    const canSend = ['email_drafted', 'email_failed'].includes(app.status);

                    return (
                        <div key={app._id} style={{ padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                                        {app.jobTitle || 'Untitled role'}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        🏢 {app.companyName || 'Unknown'}
                                        {app.cv?.matchScore ? ` · 🎯 ${app.cv.matchScore}% match` : ''}
                                        {app.contacts?.length ? ` · 👥 ${app.contacts.length} contact(s)` : ''}
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: app.status === 'emailed' ? '#34d399' : failed ? '#f87171' : '#60a5fa', whiteSpace: 'nowrap' }}>
                                    {STATUS_LABEL[app.status] || app.status}
                                </div>
                            </div>

                            {/* Step rail */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                                {(app.steps || []).map((step) => (
                                    <div key={step.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.82rem' }}>
                                        <span style={{ color: STEP_COLOR[step.status], fontWeight: 700, width: 14, flexShrink: 0 }}>
                                            {STEP_ICON[step.status]}
                                        </span>
                                        <span style={{ color: step.status === 'pending' ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                                            {STEP_LABELS[step.name] || step.name}
                                            {step.name === 'send_email' && !app.autoSend && step.status === 'pending' && ' (waits for your review)'}
                                            {step.error && (
                                                <span style={{ display: 'block', color: '#f87171', fontSize: '0.75rem', marginTop: 2 }}>{step.error}</span>
                                            )}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* Draft review */}
                            {canSend && (
                                <div style={{ marginTop: 8, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <input
                                        value={draft.subject}
                                        onChange={(e) => setEditing((p) => ({ ...p, [app._id]: { ...draft, subject: e.target.value } }))}
                                        placeholder="Subject"
                                        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'white', borderRadius: 8, padding: '10px 12px', fontSize: '0.88rem' }}
                                    />
                                    <textarea
                                        value={draft.body}
                                        onChange={(e) => setEditing((p) => ({ ...p, [app._id]: { ...draft, body: e.target.value } }))}
                                        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'white', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem', minHeight: 160, resize: 'vertical', fontFamily: 'inherit' }}
                                    />
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                        To: {(app.contacts || []).map((c) => c.email).join(', ') || 'no recipients found'}
                                    </div>
                                </div>
                            )}

                            {app.email?.sentAt && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                                    Sent {new Date(app.email.sentAt).toLocaleString()} to {(app.email.to || []).join(', ')}
                                    {app.email.attachmentStatus === 'missing' && (
                                        <span style={{ color: '#fbbf24' }}> · ⚠ no resume attached</span>
                                    )}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {app.cv?.pdfPath && (
                                    <a href={`${apiBase}/api/applications/${app._id}/cv`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                                        📄 View CV
                                    </a>
                                )}
                                {canSend && (
                                    <button type="button" className="btn btn-primary btn-sm" disabled={busy || !app.contacts?.length}
                                        onClick={() => act(app, '/send', { subject: draft.subject, body: draft.body })}>
                                        {busy ? <div className="spinner" /> : '📤 Review & Send'}
                                    </button>
                                )}
                                {failed && (
                                    <button type="button" className="btn btn-primary btn-sm" disabled={busy}
                                        onClick={() => act(app, '/retry', { step: failed.name })}>
                                        ↻ Retry {STEP_LABELS[failed.name] || failed.name}
                                    </button>
                                )}
                                {app.status === 'applying' && (
                                    <>
                                        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(app, '/approve', { autoSend: false })}>✓ Approve</button>
                                        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(app, '/deny')}>✕ Deny</button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
