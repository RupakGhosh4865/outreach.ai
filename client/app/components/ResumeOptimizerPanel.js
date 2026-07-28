'use client';

import { useState } from 'react';
import {
    AlertTriangle, CheckCircle2, Download, Eye, FileSignature, Lightbulb, Minus, Plus,
} from 'lucide-react';
import { Alert, Button, Card, cn } from './ui';
import ResumePreview from './ResumePreview';
import { downloadAuthedFile, openAuthedFile } from '@/lib/api';

// The optimizer still keys the two resume slots as 'genai'/'backend' internally;
// the UI calls them Resume 1 and Resume 2.
const SLOT_LABELS = { genai: 'Resume 1', backend: 'Resume 2' };

/** Small pill for an added/removed keyword. */
const CHIP_TONES = {
    add: 'bg-success/12 text-success',
    warn: 'bg-warning/12 text-warning',
    remove: 'bg-danger/12 text-danger',
};

function Chip({ tone, children }) {
    return (
        <span className={cn('inline-block rounded-full px-2.5 py-1 text-xs font-semibold', CHIP_TONES[tone] || CHIP_TONES.remove)}>
            {children}
        </span>
    );
}

/**
 * Circular percentage indicator for the optimisation run.
 *
 * Uses the same conic-gradient approach as JobRadar's match ring so progress
 * reads consistently across the app.
 */
function ProgressRing({ percent }) {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    return (
        <div
            className="relative grid size-14 shrink-0 place-items-center rounded-full transition-all duration-700"
            style={{ background: `conic-gradient(var(--color-info) ${value * 3.6}deg, rgba(255,255,255,0.09) 0deg)` }}
        >
            <div className="grid size-11 place-items-center rounded-full bg-bg">
                <span className="text-sm font-extrabold text-info" data-numeric>{value}</span>
            </div>
        </div>
    );
}

/** The finished ATS match, coloured by how strong it is. */
function ScoreRing({ score }) {
    const value = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    const colour = value >= 75 ? 'var(--color-success)' : value >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
    const text = value >= 75 ? 'text-success' : value >= 50 ? 'text-warning' : 'text-danger';
    return (
        <div
            className="relative grid size-16 place-items-center rounded-full"
            style={{ background: `conic-gradient(${colour} ${value * 3.6}deg, rgba(255,255,255,0.09) 0deg)` }}
            role="img"
            aria-label={`ATS match ${value} percent`}
        >
            <div className="grid size-13 place-items-center rounded-full bg-bg">
                <span className={cn('text-base font-extrabold', text)} data-numeric>{value}%</span>
            </div>
        </div>
    );
}

export default function ResumeOptimizerPanel({
    optimizeState,
    compact = false,
    attachCover = false,
    onAttachCoverChange = null,
}) {
    const [busy, setBusy] = useState('');
    const [fileError, setFileError] = useState('');
    const [expanded, setExpanded] = useState(false);

    const withFile = (kind, fn) => async () => {
        setBusy(kind);
        setFileError('');
        try {
            await fn();
        } catch (e) {
            setFileError(e.message || 'Could not open the CV.');
        }
        setBusy('');
    };

    if (!optimizeState) return null;
    const { status, key, result, template, percent = 5, stageLabel } = optimizeState;

    if (status === 'pending') {
        return (
            <Card className="mb-4 border-info/25 bg-info/4">
                <div className="mb-4 flex items-center gap-4" role="status" aria-live="polite">
                    <ProgressRing percent={percent} />
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-info">{stageLabel || 'Tailoring your CV'}</p>
                        <p className="mt-0.5 text-xs text-muted">
                            Rewriting the wording inside your own layout — structure, dates and
                            employers stay exactly as they are.
                        </p>
                    </div>
                </div>
                {/* The user's real CV, so it's visible that only words change. */}
                <ResumePreview layout={template} running />
            </Card>
        );
    }

    if (status === 'failed') {
        return (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-warning/25 bg-warning/8 px-4 py-3" role="status">
                <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
                <p className="text-sm text-warning">
                    Couldn&apos;t build a matched CV — your profile resume will be attached instead.
                </p>
            </div>
        );
    }

    if (status !== 'done' || !result) return null;

    const pdfPath = result.pdfUrl || `/api/jobs/optimize-resume/pdf?key=${key}`;
    const winner = result.selectedResume;

    const preview = withFile('preview', async () => {
        // Falls back to a download if the browser blocked the new tab.
        const opened = await openAuthedFile(pdfPath);
        if (!opened) await downloadAuthedFile(pdfPath, 'Optimized_Resume.pdf');
    });

    const download = withFile('download', () => downloadAuthedFile(pdfPath, 'Optimized_Resume.pdf'));

    const downloadCover = withFile('cover', () => downloadAuthedFile(result.coverUrl, 'Cover_Letter.pdf'));

    return (
        <Card className="mb-4 border-success/25 bg-success/4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-bold text-success">
                    <CheckCircle2 className="size-4.5" aria-hidden="true" />
                    Matched CV ready
                </p>
                <div className="flex gap-2">
                    <Button type="button" variant="secondary" size="sm" loading={busy === 'preview'} onClick={preview}>
                        {busy !== 'preview' && <Eye className="size-3.5" aria-hidden="true" />}
                        Preview
                    </Button>
                    <Button type="button" size="sm" loading={busy === 'download'} onClick={download}>
                        {busy !== 'download' && <Download className="size-3.5" aria-hidden="true" />}
                        Download
                    </Button>
                </div>
            </div>

            {fileError && <Alert tone="danger" className="mb-4">{fileError}</Alert>}

            {/* Layout-preserving path only: shows the rewritten lines settling
                into the user's own document. */}
            {result.layout && (
                <div className="mb-4">
                    <ResumePreview layout={result.layout} changes={result.changes} expanded={expanded} />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        {result.changes?.length > 0 ? (
                            <p className="text-xs text-subtle">
                                <span className="font-semibold text-text" data-numeric>{result.changes.length}</span>{' '}
                                line(s) rewritten · layout, dates and employers unchanged
                            </p>
                        ) : <span />}
                        <button
                            type="button"
                            onClick={() => setExpanded((e) => !e)}
                            aria-expanded={expanded}
                            className="tap rounded text-xs font-semibold text-brand"
                        >
                            {expanded ? 'Collapse' : 'View full document'}
                        </button>
                    </div>
                </div>
            )}

            {/* One score for one tailored CV. This previously rendered two cards
                bound to `genaiScore`/`backendScore`, which no endpoint has ever
                returned — so both always read 0%. */}
            <div className={cn('mb-4 flex gap-4', compact && 'flex-col')}>
                <div className="flex shrink-0 flex-col items-center gap-1">
                    <ScoreRing score={result.matchScore} />
                    <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-subtle">
                        ATS match
                    </span>
                    {SLOT_LABELS[winner] && (
                        <span className="text-[0.65rem] text-subtle">{SLOT_LABELS[winner]}</span>
                    )}
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                    {result.matchedKeywords?.length > 0 && (
                        <div>
                            <p className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-wide text-subtle">
                                Strengths
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {result.matchedKeywords.slice(0, 10).map((k, i) => <Chip key={i} tone="add">{k}</Chip>)}
                            </div>
                        </div>
                    )}

                    {result.missingKeywords?.length > 0 && (
                        <div>
                            <p className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-wide text-subtle">
                                Missing / to address
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {result.missingKeywords.slice(0, 8).map((k, i) => <Chip key={i} tone="warn">{k}</Chip>)}
                            </div>
                            <p className="mt-1.5 text-xs text-subtle">
                                Deliberately left out of the CV — claiming these would not survive an interview.
                            </p>
                        </div>
                    )}

                    {result.gaps?.length > 0 && (
                        <ul className="space-y-1">
                            {result.gaps.slice(0, 3).map((g, i) => (
                                <li key={i} className="flex gap-2 text-sm text-muted">
                                    <span className="mt-2 size-1 shrink-0 rounded-full bg-subtle" aria-hidden="true" />
                                    {g}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {result.addedKeywords?.length > 0 && (
                <div className="mb-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted">
                        <Plus className="size-3.5 text-success" aria-hidden="true" />
                        Keywords added
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {result.addedKeywords.map((k, i) => <Chip key={i} tone="add">{k}</Chip>)}
                    </div>
                </div>
            )}

            {result.removedKeywords?.length > 0 && (
                <div className="mb-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted">
                        <Minus className="size-3.5 text-danger" aria-hidden="true" />
                        Removed
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {result.removedKeywords.map((k, i) => <Chip key={i} tone="remove">{k}</Chip>)}
                    </div>
                </div>
            )}

            {result.coverText && (
                <div className="mb-4 rounded-xl border border-white/8 bg-white/2 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-subtle">
                            <FileSignature className="size-3.5" aria-hidden="true" />
                            Cover letter
                        </p>
                        <div className="flex items-center gap-2">
                            {result.coverUrl && (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    loading={busy === 'cover'}
                                    onClick={downloadCover}
                                >
                                    {busy !== 'cover' && <Download className="size-3.5" aria-hidden="true" />}
                                    PDF
                                </Button>
                            )}
                            {onAttachCoverChange && (
                                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
                                    <input
                                        type="checkbox"
                                        checked={attachCover}
                                        onChange={(e) => onAttachCoverChange(e.target.checked)}
                                        className="size-4 accent-brand"
                                    />
                                    Attach to email
                                </label>
                            )}
                        </div>
                    </div>
                    <p className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/20 p-3 text-sm leading-relaxed text-muted">
                        {result.coverText}
                    </p>
                </div>
            )}

            {result.atsTips?.length > 0 && (
                <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted">
                        <Lightbulb className="size-3.5 text-warning" aria-hidden="true" />
                        ATS tips
                    </p>
                    <ul className="space-y-1.5">
                        {result.atsTips.slice(0, 5).map((t, i) => (
                            <li key={i} className="flex gap-2 text-sm text-muted">
                                <span className="mt-2 size-1 shrink-0 rounded-full bg-subtle" aria-hidden="true" />
                                {t}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Card>
    );
}
