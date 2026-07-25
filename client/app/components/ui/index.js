'use client';

import { forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
    AlertTriangle, CheckCircle2, Info, XCircle, Loader2,
} from 'lucide-react';

/**
 * Shared UI primitives.
 *
 * Everything here reads from the tokens in globals.css. Pages compose these
 * rather than restyling from scratch, which is what previously let three
 * different button treatments and two different card styles coexist.
 */

/** Merge conditional classes, with later Tailwind utilities winning. */
export const cn = (...inputs) => twMerge(clsx(inputs));

/* ── Button ──────────────────────────────────────────────────────────────── */

const BUTTON_VARIANTS = {
    primary: 'ui-btn-primary',
    secondary: 'ui-btn-secondary',
    ghost: 'ui-btn-ghost',
    danger: 'ui-btn-danger',
};

const BUTTON_SIZES = {
    sm: 'ui-btn-sm',
    md: '',
    lg: 'ui-btn-lg',
};

/**
 * `loading` disables the button and swaps in a spinner, so an async action can
 * never be double-submitted. `icon` renders a square 44px target.
 */
export const Button = forwardRef(function Button({
    variant = 'primary',
    size = 'md',
    loading = false,
    icon = false,
    block = false,
    disabled,
    className,
    children,
    ...props
}, ref) {
    return (
        <button
            ref={ref}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={cn(
                'ui-btn',
                BUTTON_VARIANTS[variant],
                BUTTON_SIZES[size],
                block && 'ui-btn-block',
                icon && 'ui-btn-icon',
                className,
            )}
            {...props}
        >
            {loading && <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />}
            {children}
        </button>
    );
});

/* ── Card ────────────────────────────────────────────────────────────────── */

export function Card({ className, padded = true, children, ...props }) {
    return (
        <div className={cn('ui-card', padded && 'ui-card-pad', className)} {...props}>
            {children}
        </div>
    );
}

/**
 * Section header for a card. `icon` is a Lucide component (not an emoji), and
 * `accent` tints it to signal what kind of panel this is.
 */
export function CardTitle({ icon: Icon, accent = 'brand', title, description, action, className }) {
    const tints = {
        brand: 'text-brand bg-brand/10 ring-brand/25',
        info: 'text-info bg-info/10 ring-info/25',
        success: 'text-success bg-success/10 ring-success/25',
        warning: 'text-warning bg-warning/10 ring-warning/25',
    };

    return (
        <div className={cn('mb-5 flex items-start justify-between gap-4', className)}>
            <div className="flex min-w-0 items-start gap-3">
                {Icon && (
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl ring-1', tints[accent])}>
                        <Icon className="size-4.5" aria-hidden="true" />
                    </span>
                )}
                <div className="min-w-0">
                    <h2 className="text-[0.95rem] font-bold text-text sm:text-base">{title}</h2>
                    {description && <p className="mt-0.5 text-sm text-subtle">{description}</p>}
                </div>
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}

/* ── Badge ───────────────────────────────────────────────────────────────── */

export function Badge({ tone = 'neutral', icon: Icon, className, children, ...props }) {
    return (
        <span className={cn('ui-badge', `ui-badge-${tone}`, className)} {...props}>
            {Icon && <Icon className="size-3" aria-hidden="true" />}
            {children}
        </span>
    );
}

/* ── Alert ───────────────────────────────────────────────────────────────── */

const ALERT_ICONS = {
    success: CheckCircle2,
    warning: AlertTriangle,
    danger: XCircle,
    info: Info,
};

/**
 * Errors and successes carry an icon as well as colour — colour alone is not an
 * accessible signal. `role="alert"` announces failures to screen readers.
 */
export function Alert({ tone = 'info', title, className, children, ...props }) {
    const Icon = ALERT_ICONS[tone];
    return (
        <div
            role={tone === 'danger' ? 'alert' : 'status'}
            className={cn('ui-alert', `ui-alert-${tone}`, className)}
            {...props}
        >
            <Icon className="mt-px size-4.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                {title && <p className="font-semibold">{title}</p>}
                {children && <div className={cn(title && 'mt-0.5 opacity-90')}>{children}</div>}
            </div>
        </div>
    );
}

/* ── Field ───────────────────────────────────────────────────────────────── */

/**
 * A labelled form control. The label is always visible (placeholder-only labels
 * disappear the moment someone types), and the error sits next to the field it
 * belongs to rather than in a summary far away.
 */
export function Field({ label, htmlFor, hint, error, required, children, className }) {
    return (
        <div className={cn('mb-5', className)}>
            {label && (
                <label className="ui-label" htmlFor={htmlFor}>
                    {label}
                    {required && <span className="ml-1 text-danger" aria-hidden="true">*</span>}
                    {required && <span className="sr-only"> (required)</span>}
                </label>
            )}
            {children}
            {error ? (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-danger" role="alert">
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                    {error}
                </p>
            ) : hint ? (
                <p className="ui-hint">{hint}</p>
            ) : null}
        </div>
    );
}

export const Input = forwardRef(function Input({ className, invalid, ...props }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={cn('ui-input', className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, invalid, ...props }, ref) {
    return <textarea ref={ref} aria-invalid={invalid || undefined} className={cn('ui-textarea', className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
    return <select ref={ref} className={cn('ui-select', className)} {...props}>{children}</select>;
});

/* ── Loading & empty states ──────────────────────────────────────────────── */

export function Spinner({ className, label = 'Loading' }) {
    return (
        <>
            <Loader2 className={cn('size-5 animate-spin text-brand', className)} aria-hidden="true" />
            <span className="sr-only">{label}</span>
        </>
    );
}

export function Skeleton({ className }) {
    return <div className={cn('ui-skeleton', className)} aria-hidden="true" />;
}

/** Skeleton rows conveying the shape of what's loading, rather than a bare spinner. */
export function SkeletonList({ rows = 3, className }) {
    return (
        <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="ui-card ui-card-pad">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="mt-3 h-3 w-2/3" />
                </div>
            ))}
        </div>
    );
}

/**
 * Empty state. Always says what to do next — a blank panel reads as breakage.
 */
export function EmptyState({ icon: Icon, title, description, action, className }) {
    return (
        <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
            {Icon && (
                <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-white/5 ring-1 ring-white/10">
                    <Icon className="size-6 text-subtle" aria-hidden="true" />
                </span>
            )}
            <h3 className="text-base font-bold text-text">{title}</h3>
            {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
            {action && <div className="mt-6">{action}</div>}
        </div>
    );
}

/* ── Stat ────────────────────────────────────────────────────────────────── */

export function Stat({ label, value, icon: Icon, tone = 'brand', hint }) {
    const tints = {
        brand: 'text-brand bg-brand/10',
        info: 'text-info bg-info/10',
        success: 'text-success bg-success/10',
    };
    return (
        <div className="ui-card p-5">
            <div className="flex items-center justify-between gap-3">
                <p className="text-[0.7rem] font-bold uppercase tracking-wider text-subtle">{label}</p>
                {Icon && (
                    <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', tints[tone])}>
                        <Icon className="size-4" aria-hidden="true" />
                    </span>
                )}
            </div>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-text" data-numeric>{value}</p>
            {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
        </div>
    );
}
