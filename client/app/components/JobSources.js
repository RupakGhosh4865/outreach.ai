'use client';

import { useState, useRef } from 'react';
import { ExternalLink, FileUp, Inbox, Paperclip, X } from 'lucide-react';
import { Alert, Badge, Button, Card, CardTitle, Textarea, cn } from './ui';
import { apiPost } from '@/lib/api';

const VALIDATION = {
    open: { label: 'Open', tone: 'success' },
    closed: { label: 'Closed', tone: 'danger' },
    unreachable: { label: 'Unverified', tone: 'warning' },
    unknown: { label: 'Unknown', tone: 'neutral' },
};

/**
 * Ingestion panel: paste job links or a JD, or drop a document of links.
 * Each ingested job becomes an application the user can Apply Now on.
 */
export default function JobSources({ userEmail, isExtension, onApplicationChange }) {
    const [text, setText] = useState('');
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [jobs, setJobs] = useState([]);
    const [applyingId, setApplyingId] = useState('');
    const fileRef = useRef(null);

    const post = (path, body) => apiPost(path, body);

    async function ingest() {
        if (!userEmail) { setError('Sign in first.'); return; }
        if (!text.trim() && !file) { setError('Paste job links or a description, or attach a document.'); return; }

        setBusy(true);
        setError('');
        try {
            const form = new FormData();
            if (text.trim()) form.append('text', text.trim());
            if (file) form.append('document', file);

            const data = await apiPost('/api/job-sources/ingest', form);
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
        <Card className="mb-4">
            <CardTitle
                icon={Inbox}
                accent="info"
                title="Add jobs"
                description="Paste links or a description, or drop in a document."
            />

            <Textarea
                aria-label="Job links or description"
                placeholder="Paste job links, one per line — or a full job description…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-h-24"
            />

            <div className={cn('mt-3 flex gap-3', isExtension ? 'flex-col' : 'flex-col sm:flex-row sm:items-center')}>
                {/* The native file input is visually replaced by a labelled drop
                    target — the default control is unstyleable and reads poorly
                    on mobile — while staying a real <input> for accessibility. */}
                <div className="min-w-0 flex-1">
                    <input
                        ref={fileRef}
                        id="job-doc"
                        type="file"
                        accept=".pdf,.txt,.csv,.docx"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="sr-only"
                    />
                    <label
                        htmlFor="job-doc"
                        className="tap flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/2 px-3 text-sm text-subtle transition-colors hover:border-brand/40 hover:text-text"
                    >
                        <Paperclip className="size-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">
                            {file ? file.name : 'Attach a PDF, DOCX, TXT or CSV'}
                        </span>
                        {file && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setFile(null);
                                    if (fileRef.current) fileRef.current.value = '';
                                }}
                                aria-label="Remove attached file"
                                className="tap shrink-0 rounded p-1 hover:text-danger"
                            >
                                <X className="size-3.5" aria-hidden="true" />
                            </button>
                        )}
                    </label>
                </div>

                <Button type="button" onClick={ingest} disabled={busy} loading={busy} className="shrink-0">
                    {!busy && <FileUp className="size-4" aria-hidden="true" />}
                    Ingest jobs
                </Button>
            </div>

            {error && <Alert tone="danger" className="mt-3">{error}</Alert>}

            {jobs.length > 0 && (
                <ul className="mt-4 max-h-104 space-y-2 overflow-y-auto">
                    {jobs.map((job) => {
                        const badge = VALIDATION[job.validation?.status] || VALIDATION.unknown;
                        const busyThis = applyingId === job._id;
                        return (
                            <li
                                key={job._id}
                                className={cn(
                                    'flex gap-3 rounded-xl border border-white/8 bg-white/2 p-3',
                                    isExtension ? 'flex-col' : 'flex-col sm:flex-row sm:items-center sm:justify-between',
                                )}
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold">{job.jobTitle || 'Untitled role'}</p>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-subtle">
                                        <span className="truncate">{job.companyName || 'Unknown company'}</span>
                                        <Badge tone={badge.tone}>{badge.label}</Badge>
                                    </p>
                                </div>

                                <div className="flex shrink-0 flex-wrap gap-2">
                                    {job.status === 'applying' ? (
                                        <>
                                            <Button type="button" size="sm" disabled={busyThis} onClick={() => decide(job, 'approve')}>
                                                Approve
                                            </Button>
                                            <Button type="button" size="sm" variant="ghost" disabled={busyThis} onClick={() => decide(job, 'deny')}>
                                                Deny
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            disabled={busyThis || !job.applyUrl}
                                            loading={busyThis}
                                            onClick={() => applyNow(job)}
                                        >
                                            {!busyThis && <ExternalLink className="size-3.5" aria-hidden="true" />}
                                            Apply now
                                        </Button>
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
