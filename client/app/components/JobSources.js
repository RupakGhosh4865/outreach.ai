'use client';
import { useState, useRef } from 'react';

const BADGE = {
    open: { label: 'Open', bg: 'rgba(52,211,153,0.15)', color: '#34d399' },
    closed: { label: 'Closed', bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
    unreachable: { label: 'Unverified', bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
    unknown: { label: 'Unknown', bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
};

/**
 * Ingestion panel: paste job links or a JD, or drop a document of links.
 * Each ingested job becomes an application the user can Apply Now on.
 */
export default function JobSources({ apiBase, userEmail, isExtension, onApplicationChange }) {
    const [text, setText] = useState('');
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [jobs, setJobs] = useState([]);
    const [applyingId, setApplyingId] = useState('');
    const fileRef = useRef(null);

    async function post(path, body) {
        const res = await fetch(`${apiBase}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Request failed');
        return data;
    }

    async function ingest() {
        if (!userEmail) { setError('Sign in first.'); return; }
        if (!text.trim() && !file) { setError('Paste job links or a description, or attach a document.'); return; }

        setBusy(true);
        setError('');
        try {
            const form = new FormData();
            form.append('userEmail', userEmail);
            if (text.trim()) form.append('text', text.trim());
            if (file) form.append('document', file);

            const res = await fetch(`${apiBase}/api/job-sources/ingest`, { method: 'POST', body: form });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Ingest failed');

            setJobs(data.applications || []);
            if (data.errors?.length) {
                setError(`${data.errors.length} link(s) could not be read: ${data.errors[0].error}`);
            }
            setText('');
            setFile(null);
            if (fileRef.current) fileRef.current.value = '';
            onApplicationChange?.();
        } catch (e) {
            setError(e.message);
        }
        setBusy(false);
    }

    async function applyNow(job) {
        window.open(job.applyUrl, '_blank', 'noopener');
        setApplyingId(job._id);
        try {
            const data = await post(`/api/applications/${job._id}/apply-clicked`, {});
            setJobs((prev) => prev.map((j) => (j._id === job._id ? data.application : j)));
            onApplicationChange?.();
        } catch (e) {
            setError(e.message);
        }
        setApplyingId('');
    }

    async function decide(job, decision) {
        setApplyingId(job._id);
        try {
            const data = await post(`/api/applications/${job._id}/${decision}`, decision === 'approve' ? { autoSend: false } : {});
            setJobs((prev) => prev.map((j) => (j._id === job._id ? data.application : j)));
            onApplicationChange?.();
        } catch (e) {
            setError(e.message);
        }
        setApplyingId('');
    }

    return (
        <div className="form-group" style={{ marginBottom: 32, padding: 24, background: 'rgba(168,85,247,0.04)', borderRadius: 20, border: '1px solid rgba(168,85,247,0.15)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#a855f7' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <label style={{ color: '#a855f7', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                    📥 Job Sources
                </label>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Paste links or a JD → the agent scrapes & validates each one
                </div>
            </div>

            <textarea
                placeholder={'Paste job links (one per line) — or paste a full job description…'}
                value={text}
                onChange={(e) => setText(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'white', borderRadius: 12, padding: '14px 18px', fontSize: '0.95rem', minHeight: 90, resize: 'vertical' }}
            />

            <div style={{ display: 'flex', gap: 12, marginTop: 12, flexDirection: isExtension ? 'column' : 'row', alignItems: isExtension ? 'stretch' : 'center' }}>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.csv"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-secondary)' }}
                />
                <button type="button" onClick={ingest} disabled={busy} className="btn btn-primary" style={{ borderRadius: 12, padding: '0 24px', minWidth: 160, height: 48 }}>
                    {busy ? <div className="spinner" /> : '🤖 Ingest Jobs'}
                </button>
            </div>

            {error && <div className="alert alert-error" style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}

            {jobs.length > 0 && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
                    {jobs.map((job) => {
                        const badge = BADGE[job.validation?.status] || BADGE.unknown;
                        const busyThis = applyingId === job._id;
                        return (
                            <div key={job._id} style={{ padding: '14px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexDirection: isExtension ? 'column' : 'row', alignItems: isExtension ? 'stretch' : 'center' }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: 3 }}>
                                        {job.jobTitle || 'Untitled role'}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                                        <span>🏢 {job.companyName || 'Unknown'}</span>
                                        {job.location && <span>📍 {job.location}</span>}
                                        <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 20, fontWeight: 700, background: badge.bg, color: badge.color }}>
                                            {badge.label}
                                        </span>
                                        <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 20, fontWeight: 700, background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>
                                            {job.applyMethod === 'direct' ? 'DIRECT APPLY' : 'EXTERNAL'}
                                        </span>
                                    </div>
                                    {job.validation?.reason && (
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{job.validation.reason}</div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
                                    {job.status === 'applying' ? (
                                        <>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Finished applying?</span>
                                            <button type="button" className="btn btn-primary btn-sm" disabled={busyThis} onClick={() => decide(job, 'approve')}>✓ Approve</button>
                                            <button type="button" className="btn btn-secondary btn-sm" disabled={busyThis} onClick={() => decide(job, 'deny')}>✕ Deny</button>
                                        </>
                                    ) : job.status === 'denied' ? (
                                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>✕ Denied</span>
                                    ) : job.status === 'ready' ? (
                                        <button type="button" className="btn btn-primary btn-sm" disabled={busyThis || !job.applyUrl} onClick={() => applyNow(job)} style={{ whiteSpace: 'nowrap' }}>
                                            {busyThis ? <div className="spinner" /> : '↗ Apply Now'}
                                        </button>
                                    ) : (
                                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#34d399' }}>✓ In pipeline</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
