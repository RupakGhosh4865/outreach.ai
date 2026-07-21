'use client';
import { useState, useEffect } from 'react';

function fmtSalary(min, max) {
    const f = (n) => `£${Math.round(n / 1000)}k`;
    if (min && max) return `${f(min)} – ${f(max)}`;
    if (min) return `from ${f(min)}`;
    if (max) return `up to ${f(max)}`;
    return null;
}

function fmtDate(d) {
    if (!d) return null;
    const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    return `${days}d ago`;
}

export default function UkJobFinder({ apiBase, onRunAutopilot, isExtension, autopilotBusy, userEmail, onApplicationChange }) {
    const [jdText, setJdText] = useState('');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState(null); // { query, jobs, sources, cached }
    const [error, setError] = useState('');
    // applyUrl -> { id, status } for jobs the user has started applying to
    const [applying, setApplying] = useState({});
    const [busyUrl, setBusyUrl] = useState('');

    async function api(path, body) {
        const res = await fetch(`${apiBase}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Request failed');
        return data;
    }

    // Opens the company's site and parks the job in a pending state until the
    // user tells us whether they actually completed the application.
    async function handleApplyNow(job) {
        if (!userEmail) { setError('Sign in first so we can track this application.'); return; }
        window.open(job.applyUrl, '_blank', 'noopener');
        setBusyUrl(job.applyUrl);
        setError('');
        try {
            const { application } = await api('/api/job-sources/from-search', { userEmail, job });
            const after = await api(`/api/applications/${application._id}/apply-clicked`, {});
            setApplying((prev) => ({ ...prev, [job.applyUrl]: { id: application._id, status: after.application.status } }));
            onApplicationChange?.();
        } catch (e) {
            setError(e.message);
        }
        setBusyUrl('');
    }

    async function resolveApplication(job, decision) {
        const entry = applying[job.applyUrl];
        if (!entry) return;
        setBusyUrl(job.applyUrl);
        setError('');
        try {
            await api(`/api/applications/${entry.id}/${decision}`, decision === 'approve' ? { autoSend: false } : {});
            setApplying((prev) => ({ ...prev, [job.applyUrl]: { ...entry, status: decision === 'approve' ? 'approved' : 'denied' } }));
            onApplicationChange?.();
        } catch (e) {
            setError(e.message);
        }
        setBusyUrl('');
    }

    // A pending application outlives the page — restore it so Approve/Deny is
    // still there when the user comes back from the company's site.
    useEffect(() => {
        if (!userEmail) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${apiBase}/api/applications?userEmail=${encodeURIComponent(userEmail)}&status=applying`);
                const data = await res.json();
                if (cancelled || !res.ok) return;
                const restored = {};
                for (const app of data.applications || []) {
                    if (app.applyUrl) restored[app.applyUrl] = { id: app._id, status: app.status };
                }
                setApplying((prev) => ({ ...restored, ...prev }));
            } catch { /* the gate still works, it just starts empty */ }
        })();
        return () => { cancelled = true; };
    }, [apiBase, userEmail]);

    async function search() {
        if (!jdText.trim()) return;
        setSearching(true);
        setError('');
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`${apiBase}/api/job-search/uk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ jdText }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Search failed');
            setResults(data);
        } catch (e) {
            setError(e.message);
            setResults(null);
        }
        setSearching(false);
    }

    return (
        <div className="form-group" style={{ marginBottom: 32, padding: '24px', background: 'rgba(59, 130, 246, 0.04)', borderRadius: '20px', border: '1px solid rgba(59,130,246,0.15)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#3b82f6' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <label style={{ color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                    🇬🇧 UK Job Finder
                </label>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Paste any JD → find live UK roles</div>
            </div>

            <div style={{ display: 'flex', gap: 12, flexDirection: isExtension ? 'column' : 'row' }}>
                <textarea
                    placeholder="Paste a job description (or just a role like 'Senior React Developer')…"
                    value={jdText}
                    onChange={e => setJdText(e.target.value)}
                    style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'white', borderRadius: 12, padding: '14px 18px', fontSize: '0.95rem', minHeight: '70px', resize: 'vertical' }}
                />
                <button
                    type="button"
                    onClick={search}
                    disabled={searching || !jdText.trim()}
                    className="btn btn-primary"
                    style={{ borderRadius: 12, padding: '0 24px', minWidth: isExtension ? '100%' : '160px', height: isExtension ? '48px' : '70px' }}
                >
                    {searching ? <div className="spinner" /> : '🔎 Find UK Jobs'}
                </button>
            </div>

            {error && (
                <div className="alert alert-error" style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>
            )}

            {results && (
                <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                        {results.jobs.length} UK roles for <strong style={{ color: 'var(--text-secondary)' }}>{results.query.role}</strong>
                        {results.cached && ' (cached)'}
                        {!results.cached && ` — Adzuna: ${results.sources.adzuna}, JSearch: ${results.sources.jsearch}`}
                    </div>
                    {results.jobs.length === 0 && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No matching UK listings found. Try a simpler role title.</div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
                        {results.jobs.map((job, i) => {
                            const salary = fmtSalary(job.salaryMin, job.salaryMax);
                            const posted = fmtDate(job.postedAt);
                            const pending = applying[job.applyUrl];
                            const busy = busyUrl === job.applyUrl;
                            return (
                                <div key={i} style={{ padding: '14px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexDirection: isExtension ? 'column' : 'row', alignItems: isExtension ? 'stretch' : 'center' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: 3 }}>
                                            {job.title}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                            <span>🏢 {job.company || 'Unknown'}</span>
                                            <span>📍 {job.location}</span>
                                            {salary && <span style={{ color: '#34d399' }}>💷 {salary}</span>}
                                            {posted && <span>🕐 {posted}</span>}
                                            <span style={{
                                                fontSize: '0.65rem', padding: '2px 8px', borderRadius: 20, fontWeight: 700,
                                                background: job.source === 'adzuna' ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)',
                                                color: job.source === 'adzuna' ? '#60a5fa' : '#c084fc',
                                                alignSelf: 'center',
                                            }}>{job.source.toUpperCase()}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                                        {pending?.status === 'applying' ? (
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    Finished applying on their site?
                                                </span>
                                                <button
                                                    type="button"
                                                    className="btn btn-primary btn-sm"
                                                    disabled={busy}
                                                    onClick={() => resolveApplication(job, 'approve')}
                                                    style={{ whiteSpace: 'nowrap' }}
                                                >
                                                    ✓ Approve
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    disabled={busy}
                                                    onClick={() => resolveApplication(job, 'deny')}
                                                    style={{ whiteSpace: 'nowrap' }}
                                                >
                                                    ✕ Deny
                                                </button>
                                            </div>
                                        ) : pending?.status === 'approved' ? (
                                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#34d399', whiteSpace: 'nowrap' }}>
                                                ✓ Approved — see Pipeline
                                            </span>
                                        ) : pending?.status === 'denied' ? (
                                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                ✕ Denied
                                            </span>
                                        ) : (
                                            <>
                                                {job.applyUrl && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-primary btn-sm"
                                                        disabled={busy}
                                                        onClick={() => handleApplyNow(job)}
                                                        style={{ whiteSpace: 'nowrap' }}
                                                    >
                                                        {busy ? <div className="spinner" /> : '↗ Apply Now'}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    disabled={autopilotBusy}
                                                    onClick={() => onRunAutopilot(job)}
                                                    style={{ whiteSpace: 'nowrap' }}
                                                >
                                                    🚀 Autopilot
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
