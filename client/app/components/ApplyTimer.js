'use client';

import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { cn } from './ui';

/** `mm:ss`, or `h:mm:ss` once an application has run past the hour. */
export function formatDuration(ms) {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
    const total = Math.floor(ms / 1000);
    const seconds = String(total % 60).padStart(2, '0');
    const minutes = Math.floor(total / 60) % 60;
    const hours = Math.floor(total / 3600);
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
        : `${minutes}:${seconds}`;
}

/**
 * Digital clock counting up from `startedAt`.
 *
 * Ticks on a 1s interval rather than deriving from a render, so the display
 * keeps moving while the wizard sits idle waiting on the CV or contact lookup.
 * Pass `frozenMs` once the work is done to stop the clock on a final time.
 */
export default function ApplyTimer({ startedAt, frozenMs = null, label = 'Time on this application', className }) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (frozenMs != null || !startedAt) return undefined;

        const start = new Date(startedAt).getTime();
        if (Number.isNaN(start)) return undefined;

        const tick = () => setElapsed(Date.now() - start);
        tick(); // paint immediately rather than after the first second
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [startedAt, frozenMs]);

    const value = formatDuration(frozenMs ?? elapsed);
    if (!value) return null;

    const running = frozenMs == null;

    return (
        <div
            className={cn(
                'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/4 px-3 py-1.5',
                className,
            )}
            role="timer"
            aria-live="off"
        >
            <Timer
                className={cn('size-3.5', running ? 'text-brand' : 'text-subtle')}
                aria-hidden="true"
            />
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-subtle">{label}</span>
            <span className="text-sm font-extrabold tabular-nums" data-numeric>
                {value}
            </span>
        </div>
    );
}
