'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Building2, Clock, Handshake, Mail, MailPlus, Plus, Search, Timer, X,
} from 'lucide-react';
import AuthGuard from '../components/AuthGuard';
import { Alert, Badge, Button, Card, EmptyState, Skeleton, Stat, cn } from '../components/ui';
import { apiGet } from '@/lib/api';

const EMAIL_TYPE_LABELS = {
    referral: { label: 'Referral', icon: Handshake },
    direct_apply: { label: 'Direct apply', icon: MailPlus },
    vacancy_inquiry: { label: 'Vacancy inquiry', icon: Search },
};

const STATUS_TONE = {
    sent: 'success',
    draft: 'neutral',
    generated: 'info',
    failed: 'danger',
};

const FOLLOW_UP_TONE = {
    pending: 'warning',
    sent: 'success',
    failed: 'danger',
    due: 'warning',
    cancelled: 'neutral',
    none: 'neutral',
};

export default function HistoryPage() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);
    const [userEmail, setUserEmail] = useState('');

    const [error, setError] = useState('');

    useEffect(() => {
        setUserEmail(localStorage.getItem('jobreach_email') || '');
        fetchHistory();
    }, []);

    async function fetchHistory() {
        setLoading(true);
        setError('');
        try {
            const data = await apiGet('/api/jobs/history?limit=100');
            setJobs(data.jobs || []);
        } catch (err) {
            // Failures used to be swallowed, leaving an empty page that looked
            // like "no history" rather than "could not load".
            setError(err.message || 'Could not load your history.');
        }
        setLoading(false);
    }

    const stats = {
        total: jobs.length,
        sent: jobs.filter(j => j.status === 'sent').length,
        totalEmails: jobs.reduce((sum, j) => sum + (j.sentTo?.length || 0), 0),
        companies: [...new Set(jobs.map(j => j.companyName).filter(Boolean))].length,
    };

    // Human-readable apply time (createdAt → sentAt)
    function applyTime(job) {
        if (!job.sentAt || !job.createdAt) return null;
        const ms = new Date(job.sentAt) - new Date(job.createdAt);
        if (ms < 0) return null;
        const secs = Math.floor(ms / 1000);
        if (secs < 60) return `${secs}s`;
        const mins = Math.floor(secs / 60);
        const rem  = secs % 60;
        return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
    }

    return (
        <AuthGuard>
            <div className="shell page-top pb-20">
                <header className="animate-fade-up mb-8 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Outreach history</h1>
                        <p className="mt-2 text-muted">Everything you&apos;ve sent, and what happened next.</p>
                    </div>
                    <Link href="/outreach" className="ui-btn ui-btn-primary">
                        <Plus className="size-4" aria-hidden="true" />
                        New outreach
                    </Link>
                </header>

                {/* ── Stats ────────────────────────────────────────────────── */}
                {jobs.length > 0 && (
                    <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
                        <Stat label="Campaigns" value={stats.total} icon={Mail} tone="brand" />
                        <Stat label="Sent" value={stats.sent} icon={Mail} tone="success" />
                        <Stat label="Emails delivered" value={stats.totalEmails} icon={MailPlus} tone="info" />
                        <Stat label="Companies" value={stats.companies} icon={Building2} tone="brand" />
                    </div>
                )}

                {/* ── List ─────────────────────────────────────────────────── */}
                {loading ? (
                    <div className="space-y-3">
                        {[0, 1, 2].map((i) => (
                            <Card key={i}>
                                <Skeleton className="h-5 w-1/3" />
                                <Skeleton className="mt-3 h-4 w-2/3" />
                            </Card>
                        ))}
                    </div>
                ) : error ? (
                    <Card>
                        <Alert tone="danger" className="mb-4">{error}</Alert>
                        <Button type="button" variant="secondary" onClick={fetchHistory}>Try again</Button>
                    </Card>
                ) : jobs.length === 0 ? (
                    <Card padded={false}>
                        <EmptyState
                            icon={Mail}
                            title="No outreach yet"
                            description="Once you send your first application, it'll show up here with its status and follow-up."
                            action={<Link href="/outreach" className="ui-btn ui-btn-primary">Create your first outreach</Link>}
                        />
                    </Card>
                ) : (
                    <ul className="space-y-3">
                        {jobs.map((job) => {
                            const type = EMAIL_TYPE_LABELS[job.emailType] || { label: job.emailType, icon: Mail };
                            const TypeIcon = type.icon;
                            const took = applyTime(job);

                            return (
                                <li key={job._id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelected(job)}
                                        className="ui-card ui-card-pad tap w-full text-left transition-colors duration-200 hover:border-brand/30"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate font-bold">{job.jobTitle || 'Untitled role'}</p>
                                                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-subtle">
                                                    <span className="inline-flex items-center gap-1">
                                                        <Building2 className="size-3.5" aria-hidden="true" />
                                                        {job.companyName || 'Unknown'}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1">
                                                        <TypeIcon className="size-3.5" aria-hidden="true" />
                                                        {type.label}
                                                    </span>
                                                    {took && (
                                                        <span className="inline-flex items-center gap-1">
                                                            <Timer className="size-3.5" aria-hidden="true" />
                                                            {took}
                                                        </span>
                                                    )}
                                                </p>
                                            </div>

                                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                                                {job.optimizedMatchScore != null && (
                                                    <Badge tone="brand">{job.optimizedMatchScore}% match</Badge>
                                                )}
                                                {job.followUpStatus && job.followUpStatus !== 'none' && (
                                                    <Badge tone={FOLLOW_UP_TONE[job.followUpStatus] || 'neutral'}>
                                                        Follow-up {job.followUpStatus}
                                                    </Badge>
                                                )}
                                                <Badge tone={STATUS_TONE[job.status] || 'neutral'}>{job.status}</Badge>
                                            </div>
                                        </div>

                                        <p className="mt-3 flex flex-wrap items-center gap-x-3 text-xs text-subtle">
                                            <span className="inline-flex items-center gap-1">
                                                <Clock className="size-3" aria-hidden="true" />
                                                <time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString()}</time>
                                            </span>
                                            <span>{job.sentTo?.length || 0} recipient(s)</span>
                                        </p>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {/* ── Detail drawer ────────────────────────────────────────── */}
                {selected && (
                    <div
                        className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6"
                        style={{ zIndex: 'var(--z-modal)' }}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="detail-title"
                    >
                        <button
                            type="button"
                            aria-label="Close details"
                            onClick={() => setSelected(null)}
                            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                        />
                        <div className="animate-fade-up relative flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-surface shadow-lg sm:rounded-2xl">
                            <div className="flex items-start justify-between gap-4 border-b border-white/8 p-5">
                                <div className="min-w-0">
                                    <h2 id="detail-title" className="truncate font-bold">
                                        {selected.jobTitle || 'Untitled role'}
                                    </h2>
                                    <p className="mt-0.5 truncate text-sm text-subtle">{selected.companyName}</p>
                                </div>
                                <Button type="button" variant="ghost" size="sm" icon onClick={() => setSelected(null)} aria-label="Close">
                                    <X className="size-4" aria-hidden="true" />
                                </Button>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto p-5">
                                <p className="ui-label">Subject</p>
                                <p className="mb-5 text-sm text-muted">{selected.generatedEmailSubject || '—'}</p>

                                <p className="ui-label">Body</p>
                                <pre className="mb-5 whitespace-pre-wrap rounded-xl border border-white/8 bg-white/2 p-4 font-mono text-[0.82rem] leading-relaxed text-muted">
                                    {selected.generatedEmailBody || '—'}
                                </pre>

                                <p className="ui-label">Recipients</p>
                                <ul className="mb-5 flex flex-wrap gap-2">
                                    {(selected.sentTo || []).map((e) => (
                                        <li key={e}>
                                            <Badge tone="neutral" className="normal-case tracking-normal">{e}</Badge>
                                        </li>
                                    ))}
                                    {(!selected.sentTo || selected.sentTo.length === 0) && (
                                        <li className="text-sm text-subtle">None</li>
                                    )}
                                </ul>

                                <dl className="grid grid-cols-2 gap-4 border-t border-white/8 pt-4 text-sm">
                                    {selected.optimizedResumeUsed && (
                                        <div>
                                            <dt className="text-xs uppercase tracking-wide text-subtle">CV used</dt>
                                            <dd className="mt-0.5 font-semibold">{selected.optimizedResumeUsed}</dd>
                                        </div>
                                    )}
                                    {selected.optimizedMatchScore != null && (
                                        <div>
                                            <dt className="text-xs uppercase tracking-wide text-subtle">Match score</dt>
                                            <dd className="mt-0.5 font-semibold" data-numeric>{selected.optimizedMatchScore}%</dd>
                                        </div>
                                    )}
                                    {selected.followUpDays > 0 && (
                                        <div>
                                            <dt className="text-xs uppercase tracking-wide text-subtle">Follow-up</dt>
                                            <dd className="mt-0.5 font-semibold">
                                                {selected.followUpDays} day(s) · {selected.followUpStatus}
                                            </dd>
                                        </div>
                                    )}
                                    {selected.followUpDate && (
                                        <div>
                                            <dt className="text-xs uppercase tracking-wide text-subtle">Follow-up due</dt>
                                            <dd className="mt-0.5 font-semibold">
                                                <time dateTime={selected.followUpDate}>
                                                    {new Date(selected.followUpDate).toLocaleDateString()}
                                                </time>
                                            </dd>
                                        </div>
                                    )}
                                </dl>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
