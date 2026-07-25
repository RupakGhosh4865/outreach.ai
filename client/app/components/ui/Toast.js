'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from './index';

/**
 * Toasts.
 *
 * Rendered in an aria-live region so screen readers announce them without the
 * toast stealing focus, and every toast is manually dismissible rather than
 * only auto-expiring.
 */

const ToastContext = createContext(null);

const ICONS = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
};

const TONE_CLASS = {
    success: 'border-success/40 bg-success/10 text-[#a7f3d0]',
    error: 'border-danger/40 bg-danger/10 text-[#fecaca]',
    warning: 'border-warning/40 bg-warning/10 text-[#fde68a]',
    info: 'border-info/40 bg-info/10 text-[#bfdbfe]',
};

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const dismiss = useCallback((id) => {
        setToasts((t) => t.filter((x) => x.id !== id));
    }, []);

    const toast = useCallback((message, type = 'info', { duration = 5000 } = {}) => {
        // crypto.randomUUID avoids the collisions Date.now() produced when two
        // toasts fired in the same millisecond.
        const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
        setToasts((t) => [...t, { id, message, type }]);
        if (duration > 0) setTimeout(() => dismiss(id), duration);
        return id;
    }, [dismiss]);

    const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div
                aria-live="polite"
                aria-atomic="false"
                className="pointer-events-none fixed inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:items-end sm:p-6"
                style={{ zIndex: 'var(--z-toast)' }}
            >
                {toasts.map((t) => {
                    const Icon = ICONS[t.type] || Info;
                    return (
                        <div
                            key={t.id}
                            className={cn(
                                'animate-fade-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-md',
                                TONE_CLASS[t.type] || TONE_CLASS.info,
                            )}
                        >
                            <Icon className="mt-px size-4.5 shrink-0" aria-hidden="true" />
                            <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
                            <button
                                type="button"
                                onClick={() => dismiss(t.id)}
                                aria-label="Dismiss notification"
                                className="tap -m-1 shrink-0 rounded-md p-1 opacity-60 transition hover:opacity-100"
                            >
                                <X className="size-4" aria-hidden="true" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}

/** `const { toast } = useToast(); toast('Saved', 'success')` */
export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used inside <ToastProvider>.');
    return ctx;
}
