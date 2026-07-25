'use client';

import { useState } from 'react';
import {
    AlertTriangle, CheckCircle2, Download, Eye, Lightbulb, Loader2, Minus, Plus,
} from 'lucide-react';
import { Alert, Badge, Button, Card, cn } from './ui';
import { downloadAuthedFile, openAuthedFile } from '@/lib/api';

/** Small pill for an added/removed keyword. */
function Chip({ tone, children }) {
    return (
        <span
            className={cn(
                'inline-block rounded-full px-2.5 py-1 text-xs font-semibold',
                tone === 'add' ? 'bg-success/12 text-success' : 'bg-danger/12 text-danger',
            )}
        >
            {children}
        </span>
    );
}

function ScoreCard({ label, score, selected }) {
    const tone = score > 75 ? 'text-success' : score > 50 ? 'text-warning' : 'text-danger';
    return (
        <div
            className={cn(
                'rounded-xl border p-3 transition-colors',
                selected ? 'border-success/50 bg-success/6' : 'border-white/8 bg-white/2',
            )}
        >
            <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-subtle">{label}</span>
                {selected && <Badge tone="success">Selected</Badge>}
            </div>
            <p className={cn('text-xl font-extrabold', tone)} data-numeric>{score ?? 0}%</p>
        </div>
    );
}

export default function ResumeOptimizerPanel({ optimizeState, compact = false }) {
    const [busy, setBusy] = useState('');
    const [fileError, setFileError] = useState('');

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
    const { status, key, result } = optimizeState;

    if (status === 'pending') {
        return (
            <div
                className="mb-4 flex items-center gap-3 rounded-xl border border-info/25 bg-info/8 px-4 py-3"
                role="status"
                aria-live="polite"
            >
                <Loader2 className="size-4 shrink-0 animate-spin text-info" aria-hidden="true" />
                <p className="text-sm font-semibold text-info">
                    Building a CV matched to this job…
                    <span className="ml-1 font-normal opacity-80">usually 60–90 seconds</span>
                </p>
            </div>
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

            <div className={cn('mb-4 grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-2')}>
                <ScoreCard label="Gen AI" score={result.genaiScore} selected={winner === 'genai'} />
                <ScoreCard label="Backend" score={result.backendScore} selected={winner === 'backend'} />
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
