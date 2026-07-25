'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Building2, CalendarClock, Check, Clock, ExternalLink, MapPin, Radar,
    ShieldCheck, Star, X,
} from 'lucide-react';
import { Alert, Badge, Button, Card, CardTitle, EmptyState, Select, cn } from './ui';
import { apiGet, apiPost } from '@/lib/api';

const SOURCE_META = {
    adzuna: { label: 'Adzuna' },
    jsearch: { label: 'Google Jobs API' },
    linkedin: { label: 'LinkedIn' },
    indeed: { label: 'Indeed' },
    glassdoor: { label: 'Glassdoor' },
    wellfound: { label: 'Wellfound' },
    google: { label: 'Google' },
    github: { label: 'GitHub' },
    council: { label: 'UK Councils' },
};

/**
 * Match score as a ring. The number is always present, so the score is readable
 * without relying on the colour of the arc.
 */
function ScoreRing({ score }) {
    const tone = score == null ? 'text-subtle' : score >= 70 ? 'text-success' : score >= 40 ? 'text-warning' : 'text-muted';
    const arc = score == null ? 'rgba(148,163,184,0.15)' : 'currentColor';

    return (
        <div
            className={cn('grid size-13 shrink-0 place-items-center rounded-full', tone)}
            style={{
                background: score == null
                    ? 'rgba(148,163,184,0.10)'
                    : `conic-gradient(${arc} ${score * 3.6}deg, rgba(148,163,184,0.15) 0deg)`,
            }}
            role="img"
            aria-label={score == null ? 'Not scored yet' : `Match score ${score} out of 100`}
        >
            <span className={cn('grid size-10.5 place-items-center rounded-full bg-surface text-sm font-extrabold', tone)} data-numeric>
                {score == null ? '—' : score}
            </span>
        </div>
    );
}

/**
 * Job Radar: scans every source for jobs matching the profile's target roles,
 * ATS-scores each against the resume, and hands picks to the Apply pipeline.
 */
export default function JobRadar({ userEmail, isExtension, onApplicationChange }) {
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
            const data = await apiGet(`/api/job-radar/jobs${minScore ? `?minScore=${minScore}` : ''}`);
            setJobs(data.jobs || []);
        } catch { /* transient — next poll retries */ }
    }, [userEmail, minScore]);

    useEffect(() => { loadJobs(); }, [loadJobs]);

    // Poll scan progress while running
    useEffect(() => {
        clearInterval(pollRef.current);
        if (!scan || scan.status !== 'running') return;
        const scanId = scan._id;
        pollRef.current = setInterval(async () => {
            try {
                const data = await apiGet(`/api/job-radar/scan/${scanId}`);
                setScan(data.scan);
                loadJobs(); // stream results in as sources finish
                if (data.scan.status !== 'running') clearInterval(pollRef.current);
            } catch { /* retry on next tick */ }
        }, 3000);
        return () => clearInterval(pollRef.current);
    }, [scan, loadJobs]);

    async function startScan() {
        if (!userEmail) { setError('Sign in and set up your profile first.'); return; }
        setStarting(true);
        setError('');
        try {
            const data = await apiPost('/api/job-radar/scan', { sources });
            const sr = await apiGet(`/api/job-radar/scan/${data.scanId}`);
            setScan(sr.scan);
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
                const data = await apiPost(`/api/job-radar/jobs/${job._id}/to-pipeline`, {});
                // mark apply-clicked so the Approve/Deny gate appears in the pipeline panel
                await apiPost(`/api/applications/${data.application._id}/apply-clicked`, {})
                    .catch(() => { /* ready state still shows in pipeline */ });
                onApplicationChange?.();
            } else {
                await apiPost(`/api/job-radar/jobs/${job._id}/${action}`, {});
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

    // The server already applies the minScore filter on fetch.
    const filtered = jobs;

    return (
        <Card className="mb-4">
            <CardTitle
                icon={Radar}
                accent="warning"
                title="Job radar"
                description="Scan every source for roles matching your profile."
                action={
                    <Button type="button" onClick={startScan} disabled={starting || scanning} loading={starting || scanning} size="sm">
                        {!(starting || scanning) && <Radar className="size-3.5" aria-hidden="true" />}
                        {scanning ? 'Scanning…' : 'Start scan'}
                    </Button>
                }
            />

            {error && <Alert tone="danger" className="mb-4">{error}</Alert>}

            {/* Source toggles */}
            <fieldset className="mb-4">
                <legend className="ui-label">Sources</legend>
                <div className="flex flex-wrap gap-2">
                    {Object.entries(SOURCE_META).map(([key, meta]) => {
                        const on = sources.includes(key);
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => toggleSource(key)}
                                disabled={scanning}
                                aria-pressed={on}
                                className={cn(
                                    'tap inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors duration-150 disabled:opacity-50',
                                    on
                                        ? 'border-brand/45 bg-brand/12 text-brand'
                                        : 'border-white/10 bg-white/2 text-subtle hover:border-white/25',
                                )}
                            >
                                {on && <Check className="size-3" aria-hidden="true" />}
                                {meta.label}
                            </button>
                        );
                    })}
                </div>
            </fieldset>

            {/* Scan progress */}
            {scan && (
                <div className="mb-4 rounded-xl border border-white/8 bg-white/2 p-3" aria-live="polite">
                    <p
                        className={cn(
                            'mb-2 text-sm font-bold',
                            scan.status === 'done' ? 'text-success' : scan.status === 'failed' ? 'text-danger' : 'text-info',
                        )}
                    >
                        {scan.status === 'running'
                            ? 'Scanning…'
                            : scan.status === 'done'
                                ? `Scan complete — ${scan.totalFound} found, ${scan.totalScored} scored`
                                : `Scan failed: ${scan.error || 'unknown error'}`}
                        {scan.roles?.length > 0 && (
                            <span className="font-normal text-subtle"> · {scan.roles.join(', ')}</span>
                        )}
                    </p>

                    <ul className="flex flex-wrap gap-1.5">
                        {(scan.sources || []).map((s) => {
                            const meta = SOURCE_META[s.name] || { label: s.name };
                            const tone =
                                s.status === 'done' ? 'text-success' :
                                s.status === 'failed' ? 'text-danger' :
                                s.status === 'running' ? 'text-info' : 'text-subtle';
                            return (
                                <li
                                    key={s.name}
                                    className={cn('rounded-md bg-white/4 px-2 py-1 text-[0.7rem] font-semibold', tone)}
                                    title={s.error || undefined}
                                >
                                    {meta.label}:{' '}
                                    {s.status === 'done' ? s.found
                                        : s.status === 'failed' ? 'failed'
                                            : s.status === 'running' ? '…' : '·'}
                                    {s.name === 'council' && s.status === 'running' && scan.councilProgress?.total > 0 &&
                                        ` ${scan.councilProgress.done}/${scan.councilProgress.total}`}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {/* Filter */}
            {jobs.length > 0 && (
                <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm text-subtle" data-numeric>{filtered.length} job(s)</p>
                    <label className="flex items-center gap-2 text-sm">
                        <span className="sr-only">Minimum match score</span>
                        <Select
                            value={minScore}
                            onChange={(e) => setMinScore(Number(e.target.value))}
                            className="min-h-9 w-auto py-1.5 text-sm"
                        >
                            <option value={0}>All scores</option>
                            <option value={40}>Score ≥ 40</option>
                            <option value={70}>Score ≥ 70</option>
                        </Select>
                    </label>
                </div>
            )}

            {/* Results */}
            {filtered.length === 0 ? (
                <EmptyState
                    icon={Radar}
                    title={scan ? 'No matching jobs yet' : 'No scan run yet'}
                    description={
                        scan
                            ? 'Try lowering the score filter or enabling more sources.'
                            : 'Set target roles on your profile, then start a scan.'
                    }
                />
            ) : (
                <ul className="max-h-160 space-y-2 overflow-y-auto">
                    {filtered.map((job) => {
                        const meta = SOURCE_META[job.source] || { label: job.source };
                        const busy = busyId === job._id;
                        const isOpen = expanded === job._id;

                        return (
                            <li
                                key={job._id}
                                className={cn(
                                    'flex gap-3 rounded-xl border border-white/8 bg-white/2 p-3',
                                    isExtension ? 'flex-col' : 'flex-row items-start',
                                )}
                            >
                                <ScoreRing score={job.matchScore} />

                                <div className="min-w-0 flex-1">
                                    <p className="font-bold leading-snug">{job.title}</p>

                                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                                        <span className="inline-flex items-center gap-1">
                                            <Building2 className="size-3" aria-hidden="true" />
                                            {job.company || 'Unknown'}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <MapPin className="size-3" aria-hidden="true" />
                                            {job.location}
                                        </span>
                                        {fmtDate(job.postedAt) && (
                                            <span className="inline-flex items-center gap-1">
                                                <Clock className="size-3" aria-hidden="true" />
                                                {fmtDate(job.postedAt)}
                                            </span>
                                        )}
                                        {fmtDate(job.closingDate) && (
                                            <span className="inline-flex items-center gap-1 text-warning">
                                                <CalendarClock className="size-3" aria-hidden="true" />
                                                closes {fmtDate(job.closingDate)}
                                            </span>
                                        )}
                                    </p>

                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        <Badge tone="neutral">
                                            {job.sourceDetail && job.source === 'jsearch' ? job.sourceDetail : meta.label}
                                        </Badge>
                                        {job.visaSponsor && (
                                            <Badge tone="info" icon={ShieldCheck}>Sponsor</Badge>
                                        )}
                                        {job.status === 'shortlisted' && <Badge tone="warning" icon={Star}>Shortlisted</Badge>}
                                        {job.status === 'in_pipeline' && <Badge tone="success">In pipeline</Badge>}
                                    </div>

                                    {(job.matchedSkills?.length > 0 || job.missingSkills?.length > 0) && (
                                        <div className="mt-2">
                                            <button
                                                type="button"
                                                onClick={() => setExpanded(isOpen ? '' : job._id)}
                                                aria-expanded={isOpen}
                                                className="tap rounded text-xs font-semibold text-brand"
                                            >
                                                {isOpen ? 'Hide match detail' : 'Why this match?'}
                                            </button>
                                            {isOpen && (
                                                <div className="mt-2 space-y-2 rounded-lg bg-white/3 p-2.5">
                                                    {job.matchSummary && <p className="text-xs text-muted">{job.matchSummary}</p>}
                                                    {job.matchedSkills?.length > 0 && (
                                                        <p className="text-xs">
                                                            <span className="font-bold text-success">Has: </span>
                                                            <span className="text-muted">{job.matchedSkills.join(', ')}</span>
                                                        </p>
                                                    )}
                                                    {job.missingSkills?.length > 0 && (
                                                        <p className="text-xs">
                                                            <span className="font-bold text-warning">Missing: </span>
                                                            <span className="text-muted">{job.missingSkills.join(', ')}</span>
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            disabled={busy || job.status === 'in_pipeline'}
                                            loading={busy}
                                            onClick={() => jobAction(job, 'apply')}
                                        >
                                            {!busy && <ExternalLink className="size-3.5" aria-hidden="true" />}
                                            Apply now
                                        </Button>
                                        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => jobAction(job, 'shortlist')}>
                                            <Star className="size-3.5" aria-hidden="true" />
                                            <span className="sr-only sm:not-sr-only">Shortlist</span>
                                        </Button>
                                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => jobAction(job, 'dismiss')}>
                                            <X className="size-3.5" aria-hidden="true" />
                                            <span className="sr-only sm:not-sr-only">Dismiss</span>
                                        </Button>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}
