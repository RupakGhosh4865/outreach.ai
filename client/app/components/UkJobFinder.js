'use client';

import { useState, useEffect } from 'react';
import {
    Building2, Clock, ExternalLink, MapPin, PoundSterling, Search, Zap,
} from 'lucide-react';
import { Alert, Badge, Button, Card, CardTitle, Textarea, cn } from './ui';
import { apiGet, apiPost } from '@/lib/api';

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

export default function UkJobFinder({ onRunAutopilot, isExtension, autopilotBusy, userEmail, onApplicationChange }) {
    const [jdText, setJdText] = useState('');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState(null); // { query, jobs, sources, cached }
    const [error, setError] = useState('');
    // applyUrl -> { id, status } for jobs the user has started applying to
    const [applying, setApplying] = useState({});
    const [busyUrl, setBusyUrl] = useState('');

    const api = (path, body) => apiPost(path, body);

    // Opens the company's site and parks the job in a pending state until the
    // user tells us whether they actually completed the application.
    async function handleApplyNow(job) {
        if (!userEmail) { setError('Sign in first so we can track this application.'); return; }
        window.open(job.applyUrl, '_blank', 'noopener');
        setBusyUrl(job.applyUrl);
        setError('');
        try {
            const { application } = await api('/api/job-sources/from-search', { job });
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
                const data = await apiGet('/api/applications?status=applying');
                if (cancelled) return;
                const restored = {};
                for (const app of data.applications || []) {
                    if (app.applyUrl) restored[app.applyUrl] = { id: app._id, status: app.status };
                }
                setApplying((prev) => ({ ...restored, ...prev }));
            } catch { /* the gate still works, it just starts empty */ }
        })();
        return () => { cancelled = true; };
    }, [userEmail]);

    async function search() {
        if (!jdText.trim()) return;
        setSearching(true);
        setError('');
        try {
            setResults(await apiPost('/api/job-search/uk', { jdText }));
        } catch (e) {
            setError(e.message);
            setResults(null);
        }
        setSearching(false);
    }

    return (
        <Card className="mb-4">
            <CardTitle
                icon={Search}
                accent="info"
                title="UK job finder"
                description="Paste a job description and find similar live UK listings."
            />

            <Textarea
                aria-label="Job description to search from"
                placeholder="Paste a job description — we'll extract the role and search UK boards…"
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                className="min-h-24"
            />

            <Button
                type="button"
                onClick={search}
                disabled={searching || !jdText.trim()}
                loading={searching}
                block
                className="mt-3"
            >
                {!searching && <Search className="size-4" aria-hidden="true" />}
                Find matching UK jobs
            </Button>

            {error && <Alert tone="danger" className="mt-3">{error}</Alert>}

            {results && (
                <div className="mt-4">
                    <p className="mb-3 text-sm text-subtle">
                        <span className="font-bold text-text" data-numeric>{results.jobs.length}</span> UK role(s) for{' '}
                        <strong className="text-muted">{results.query.role}</strong>
                        {results.cached && ' (cached)'}
                        {!results.cached && ` — Adzuna: ${results.sources.adzuna}, JSearch: ${results.sources.jsearch}`}
                    </p>

                    {results.jobs.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-subtle">
                            No matching UK listings. Try a simpler role title.
                        </p>
                    ) : (
                        <ul className="max-h-160 space-y-2 overflow-y-auto">
                            {results.jobs.map((job, i) => {
                                const salary = fmtSalary(job.salaryMin, job.salaryMax);
                                const posted = fmtDate(job.postedAt);
                                const pending = applying[job.applyUrl];
                                const busy = busyUrl === job.applyUrl;

                                return (
                                    <li key={job.applyUrl || i} className="rounded-xl border border-white/8 bg-white/2 p-3">
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
                                            {salary && (
                                                <span className="inline-flex items-center gap-1 text-success">
                                                    <PoundSterling className="size-3" aria-hidden="true" />
                                                    {salary}
                                                </span>
                                            )}
                                            {posted && (
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock className="size-3" aria-hidden="true" />
                                                    {posted}
                                                </span>
                                            )}
                                        </p>

                                        <div className="mt-2">
                                            <Badge tone={job.source === 'adzuna' ? 'info' : 'brand'}>{job.source}</Badge>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {pending && pending.status === 'applying' ? (
                                                /* The user opened the company's site; we need to know
                                                   whether they actually finished before starting outreach. */
                                                <>
                                                    <span className="w-full text-xs text-subtle sm:w-auto sm:self-center">
                                                        Did you complete the application?
                                                    </span>
                                                    <Button type="button" size="sm" disabled={busy} onClick={() => resolveApplication(job, 'approve')}>
                                                        Yes, approve
                                                    </Button>
                                                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => resolveApplication(job, 'deny')}>
                                                        No
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    {job.applyUrl && (
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="secondary"
                                                            disabled={busy}
                                                            loading={busy}
                                                            onClick={() => handleApplyNow(job)}
                                                        >
                                                            {!busy && <ExternalLink className="size-3.5" aria-hidden="true" />}
                                                            Apply now
                                                        </Button>
                                                    )}
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        disabled={autopilotBusy}
                                                        onClick={() => onRunAutopilot?.('text', `${job.title} at ${job.company}. ${job.description || ''}`)}
                                                    >
                                                        <Zap className="size-3.5" aria-hidden="true" />
                                                        Autopilot
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </Card>
    );
}
