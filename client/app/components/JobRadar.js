'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

const SOURCE_META = {
    adzuna: { label: 'Adzuna', color: '#60a5fa' },
    jsearch: { label: 'Google Jobs API', color: '#34d399' },
    linkedin: { label: 'LinkedIn', color: '#0a66c2' },
    indeed: { label: 'Indeed', color: '#2557a7' },
    glassdoor: { label: 'Glassdoor', color: '#0caa41' },
    wellfound: { label: 'Wellfound', color: '#ec4899' },
    google: { label: 'Google', color: '#fbbf24' },
    github: { label: 'GitHub', color: '#a78bfa' },
    council: { label: 'UK Councils 🏛', color: '#f97316' },
};

const scoreColor = (s) => (s == null ? 'var(--text-muted)' : s >= 70 ? '#34d399' : s >= 40 ? '#fbbf24' : '#94a3b8');

function ScoreRing({ score }) {
    const color = scoreColor(score);
    return (
        <div style={{
            width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
            background: score == null
                ? 'var(--bg-primary)'
                : `conic-gradient(${color} ${score * 3.6}deg, rgba(148,163,184,0.15) 0deg)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                width: 42, height: 42, borderRadius: '50%', background: 'var(--bg-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: 800, color,
            }}>
                {score == null ? '—' : score}
            </div>
        </div>
    );
}

/**
 * Job Radar: scans every source for jobs matching the profile's target roles,
 * ATS-scores each against the resume, and hands picks to the Apply pipeline.
 */
export default function JobRadar({ apiBase, userEmail, isExtension, onApplicationChange }) {
    const [sources, setSources] = useState(Object.keys(SOURCE_META));
    const [scan, setScan] = useState(null);       // live ScanRun doc
    const [jobs, setJobs] = useState([]);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState('');
    const [starting, setStarting] = useState(false);
    const [expanded, setExpanded] = useState('');
    const [minScore, setMinScore] = useState(0);
    const pollRef = useRef(null);

    const loadJobs = useCallback(async () => {
        if (!userEmail) return;
        try {
            const res = await fetch(`${apiBase}/api/job-radar/jobs?userEmail=${encodeURIComponent(userEmail)}${minScore ? `&minScore=${minScore}` : ''}`);
            const data = await res.json();
            if (res.ok) setJobs(data.jobs || []);
        } catch { /* transient — next poll retries */ }
    }, [apiBase, userEmail, minScore]);

    useEffect(() => { loadJobs(); }, [loadJobs]);

    // Poll scan progress while running
    useEffect(() => {
        clearInterval(pollRef.current);
        if (!scan || scan.status !== 'running') return;
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`${apiBase}/api/job-radar/scan/${scan._id}`);
                const data = await res.json();
                if (!res.ok) return;
                setScan(data.scan);
                loadJobs(); // stream results in as sources finish
                if (data.scan.status !== 'running') clearInterval(pollRef.current);
            } catch { /* retry on next tick */ }
        }, 3000);
        return () => clearInterval(pollRef.current);
    }, [scan?._id, scan?.status, apiBase, loadJobs]);

    async function startScan() {
        if (!userEmail) { setError('Sign in and set up your profile first.'); return; }
        setStarting(true);
        setError('');
        try {
            const res = await fetch(`${apiBase}/api/job-radar/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userEmail, sources }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Could not start scan');
            const sr = await fetch(`${apiBase}/api/job-radar/scan/${data.scanId}`);
            setScan((await sr.json()).scan);
        } catch (e) {
            setError(e.message);
        }
        setStarting(false);
    }

    async function jobAction(job, action) {
        setBusyId(job._id);
        try {
            if (action === 'apply') {
                if (job.applyUrl) window.open(job.applyUrl, '_blank', 'noopener');
                const res = await fetch(`${apiBase}/api/job-radar/jobs/${job._id}/to-pipeline`, { method: 'POST' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message);
                // mark apply-clicked so the Approve/Deny gate appears in the pipeline panel
                await fetch(`${apiBase}/api/applications/${data.application._id}/apply-clicked`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
                }).catch(() => { /* ready state still shows in pipeline */ });
                onApplicationChange?.();
            } else {
                const res = await fetch(`${apiBase}/api/job-radar/jobs/${job._id}/${action}`, { method: 'POST' });
                if (!res.ok) throw new Error((await res.json()).message);
            }
            await loadJobs();
        } catch (e) {
            setError(e.message);
        }
        setBusyId('');
    }

    const toggleSource = (s) => setSources((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
    const scanning = scan?.status === 'running';
    const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null);

    return (
        <div className="form-group" style={{ marginBottom: 32, padding: 24, background: 'rgba(249,115,22,0.04)', borderRadius: 20, border: '1px solid rgba(249,115,22,0.15)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#f97316' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <label style={{ color: '#f97316', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                    📡 Job Radar
                </label>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Scans every source for your target roles, ATS-scores each job against your resume
                </div>
            </div>

            {/* Source toggles */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {Object.entries(SOURCE_META).map(([key, meta]) => {
                    const on = sources.includes(key);
                    return (
                        <button key={key} type="button" onClick={() => toggleSource(key)} disabled={scanning}
                            style={{
                                fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                                border: `1px solid ${on ? meta.color : 'var(--border)'}`,
                                background: on ? `${meta.color}22` : 'transparent',
                                color: on ? meta.color : 'var(--text-muted)',
                            }}>
                            {meta.label}
                        </button>
                    );
                })}
            </div>

            <button type="button" className="btn btn-primary" onClick={startScan} disabled={starting || scanning || !sources.length}
                style={{ borderRadius: 12, padding: '0 24px', height: 46, minWidth: 200 }}>
                {starting || scanning ? <div className="spinner" /> : '📡 Scan for my jobs'}
            </button>

            {error && <div className="alert alert-error" style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}

            {/* Scan progress */}
            {scan && (
                <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: 8, color: scan.status === 'done' ? '#34d399' : scan.status === 'failed' ? '#f87171' : '#60a5fa' }}>
                        {scan.status === 'running' ? '⏳ Scanning…' : scan.status === 'done' ? `✓ Scan complete — ${scan.totalFound} jobs found, ${scan.totalScored} scored` : `✕ Scan failed: ${scan.error || ''}`}
                        {scan.roles?.length > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · roles: {scan.roles.join(', ')}</span>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {(scan.sources || []).map((s) => {
                            const meta = SOURCE_META[s.name] || { label: s.name, color: '#94a3b8' };
                            const chipColor = s.status === 'done' ? '#34d399' : s.status === 'failed' ? '#f87171' : s.status === 'running' ? '#60a5fa' : 'var(--text-muted)';
                            return (
                                <span key={s.name} title={s.error || ''} style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px', borderRadius: 20, border: `1px solid ${chipColor}`, color: chipColor }}>
                                    {meta.label}: {s.status === 'done' ? s.found : s.status === 'failed' ? '✕' : s.status === 'running' ? '…' : '·'}
                                    {s.name === 'council' && s.status === 'running' && scan.councilProgress?.total > 0 &&
                                        ` ${scan.councilProgress.done}/${scan.councilProgress.total}`}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Results */}
            {jobs.length > 0 && (
                <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {jobs.length} jobs, best match first
                        </div>
                        <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}
                            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', fontSize: '0.75rem' }}>
                            <option value={0}>All scores</option>
                            <option value={40}>Score ≥ 40</option>
                            <option value={70}>Score ≥ 70</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 560, overflowY: 'auto' }}>
                        {jobs.map((job) => {
                            const meta = SOURCE_META[job.source] || { label: job.source, color: '#94a3b8' };
                            const busy = busyId === job._id;
                            const isOpen = expanded === job._id;
                            return (
                                <div key={job._id} style={{ padding: '14px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', gap: 14, alignItems: 'flex-start', flexDirection: isExtension ? 'column' : 'row' }}>
                                    <ScoreRing score={job.matchScore} />

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: 3 }}>
                                            {job.title}
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                                            <span>🏢 {job.company || 'Unknown'}</span>
                                            <span>📍 {job.location}</span>
                                            {fmtDate(job.postedAt) && <span>🕐 {fmtDate(job.postedAt)}</span>}
                                            {fmtDate(job.closingDate) && <span style={{ color: '#fbbf24' }}>⏳ closes {fmtDate(job.closingDate)}</span>}
                                            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${meta.color}22`, color: meta.color }}>
                                                {job.sourceDetail && job.source === 'jsearch' ? job.sourceDetail.toUpperCase() : meta.label.toUpperCase()}
                                            </span>
                                            {job.visaSponsor && (
                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>
                                                    VISA SPONSOR
                                                </span>
                                            )}
                                            {job.status === 'shortlisted' && <span style={{ color: '#fbbf24' }}>★</span>}
                                            {job.status === 'in_pipeline' && <span style={{ color: '#34d399', fontSize: '0.7rem', fontWeight: 700 }}>IN PIPELINE</span>}
                                        </div>

                                        {(job.matchedSkills?.length > 0 || job.missingSkills?.length > 0) && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                                {(job.matchedSkills || []).map((s) => (
                                                    <span key={s} style={{ fontSize: '0.65rem', padding: '2px 7px', borderRadius: 16, background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>✓ {s}</span>
                                                ))}
                                                {(job.missingSkills || []).map((s) => (
                                                    <span key={s} style={{ fontSize: '0.65rem', padding: '2px 7px', borderRadius: 16, background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>– {s}</span>
                                                ))}
                                            </div>
                                        )}

                                        {job.matchSummary && (
                                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 5, fontStyle: 'italic' }}>{job.matchSummary}</div>
                                        )}

                                        {job.description && (
                                            <>
                                                <button type="button" onClick={() => setExpanded(isOpen ? '' : job._id)}
                                                    style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '0.72rem', cursor: 'pointer', padding: 0, marginTop: 5 }}>
                                                    {isOpen ? '▲ Hide details' : '▼ Job details'}
                                                </button>
                                                {isOpen && (
                                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 6, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
                                                        {job.description.slice(0, 2500)}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexDirection: isExtension ? 'row' : 'column' }}>
                                        {job.status !== 'in_pipeline' && (
                                            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => jobAction(job, 'apply')} style={{ whiteSpace: 'nowrap' }}>
                                                {busy ? <div className="spinner" /> : '↗ Apply Now'}
                                            </button>
                                        )}
                                        {job.status === 'new' && (
                                            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => jobAction(job, 'shortlist')}>☆</button>
                                        )}
                                        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => jobAction(job, 'dismiss')}>✕</button>
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
