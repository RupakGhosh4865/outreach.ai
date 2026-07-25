'use client';

import Link from 'next/link';
import { MotionConfig, motion } from 'framer-motion';
import {
    ArrowRight, Check, FileText, Gauge, Lock, Mail, Radar, Search, Send,
    ShieldCheck, Sparkles, Users, Zap,
} from 'lucide-react';
import { Badge } from './ui';

function Logo() {
    return (
        <span className="flex items-center gap-2.5">
            <span className="relative grid size-8 place-items-center">
                <span className="absolute inset-0 rotate-[8deg] rounded-lg bg-brand/20" aria-hidden="true" />
                <span className="relative grid size-7 rotate-[8deg] place-items-center rounded-[7px] bg-linear-to-br from-brand to-[#7ec63a]">
                    <span className="-rotate-[8deg] text-sm font-black leading-none text-brand-ink">O</span>
                </span>
            </span>
            <span className="text-[17px] font-bold tracking-[-0.02em]">
                outreach<span className="text-brand">.ai</span>
            </span>
        </span>
    );
}

const PIPELINE_STEPS = [
    { icon: Search, label: 'Read the job post', detail: 'Title, company, requirements' },
    { icon: FileText, label: 'Build a matched CV', detail: 'Rewritten and ATS-scored' },
    { icon: Users, label: 'Find the right person', detail: 'Verified work emails' },
    { icon: Send, label: 'Send a personal email', detail: 'You approve before it goes' },
];

const METRICS = [
    { value: '~60s', label: 'Job link to drafted email' },
    { value: '9', label: 'Job sources scanned' },
    { value: '100%', label: 'Reviewed by you before sending' },
];

const FEATURES = [
    { icon: Radar, title: 'Job radar', body: 'Scans nine sources for roles matching your profile, then ATS-scores each against your resume.' },
    { icon: FileText, title: 'CV per application', body: 'A CV rewritten for the specific job description, not one generic file sent everywhere.' },
    { icon: Users, title: 'Contact discovery', body: 'Finds hiring managers and their verified work emails, so you skip the application black hole.' },
    { icon: Gauge, title: 'Match scoring', body: 'Honest 0–100 scoring that tells you which roles are worth your time before you apply.' },
    { icon: Mail, title: 'Automatic follow-ups', body: 'One polite nudge if nobody replies. Sent from your own mailbox if you connect it.' },
    { icon: ShieldCheck, title: 'Nothing sends itself', body: 'Every email pauses for your review. The approval gate is not optional.' },
];

const EASE = [0.22, 1, 0.36, 1];

/**
 * Motion props are module constants, identical on the server and the client.
 *
 * These were previously derived from `useReducedMotion()`, which resolves
 * differently during SSR than on hydration — so the server rendered no inline
 * style and the client rendered `opacity: 0`, producing a hydration mismatch.
 * The reduced-motion preference is handled by <MotionConfig reducedMotion="user">
 * below, which changes how Framer animates without changing what we render.
 */
const RISE = {
    initial: { opacity: 0, y: 16 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-80px' },
    transition: { duration: 0.5, ease: EASE },
};

/** Same entrance, delayed — for staggering a row of cards. */
const riseDelayed = (delay) => ({
    ...RISE,
    transition: { duration: 0.5, delay, ease: EASE },
});

export default function LandingPage({ onStartOnboarding }) {
    return (
        <MotionConfig reducedMotion="user">
        <div className="overflow-x-hidden">
            {/* ── Nav ───────────────────────────────────────────────────────── */}
            <header
                className="fixed inset-x-0 top-0 border-b border-white/6 bg-bg/80 backdrop-blur-xl"
                style={{ zIndex: 'var(--z-nav)' }}
            >
                <nav className="shell flex h-16 items-center justify-between" aria-label="Main">
                    <Logo />
                    <div className="flex items-center gap-2">
                        <Link href="/pricing" className="tap hidden rounded-lg px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:text-text sm:block">
                            Pricing
                        </Link>
                        <Link href="/login" className="tap hidden rounded-lg px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:text-text sm:block">
                            Log in
                        </Link>
                        {/* Full-size (44px) rather than ui-btn-sm — this is the
                            primary CTA and is tapped on a phone. */}
                        <button type="button" onClick={onStartOnboarding} className="ui-btn ui-btn-primary">
                            Get started
                        </button>
                    </div>
                </nav>
            </header>

            {/* ── Hero ──────────────────────────────────────────────────────── */}
            <section className="relative pb-20 pt-32 sm:pb-28 sm:pt-40">
                <div className="aurora" aria-hidden="true" />

                <div className="shell relative grid items-center gap-12 lg:grid-cols-2">
                    <motion.div {...RISE}>
                        <Badge tone="brand" icon={Sparkles} className="mb-5">Job outreach on autopilot</Badge>

                        <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                            Stop applying into
                            <span className="text-gradient"> the void.</span>
                        </h1>

                        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
                            Paste a job link. Get a CV tailored to that exact role, the hiring
                            manager&apos;s email, and a personal message written for them — in about a minute.
                        </p>

                        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                            <button type="button" onClick={onStartOnboarding} className="ui-btn ui-btn-primary ui-btn-lg">
                                Start free
                                <ArrowRight className="size-4" aria-hidden="true" />
                            </button>
                            <Link href="/pricing" className="ui-btn ui-btn-secondary ui-btn-lg">
                                See pricing
                            </Link>
                        </div>

                        <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-subtle">
                            <span className="inline-flex items-center gap-1.5">
                                <Check className="size-4 text-brand" aria-hidden="true" />
                                No card required
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <Check className="size-4 text-brand" aria-hidden="true" />
                                3 free outreaches a month
                            </span>
                        </p>
                    </motion.div>

                    {/* Shows the product working rather than describing it. */}
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
                        className="ui-card p-5 sm:p-6"
                    >
                        <div className="mb-5 flex items-center gap-2 border-b border-white/6 pb-4">
                            <span className="size-2.5 rounded-full bg-danger/70" aria-hidden="true" />
                            <span className="size-2.5 rounded-full bg-warning/70" aria-hidden="true" />
                            <span className="size-2.5 rounded-full bg-success/70" aria-hidden="true" />
                            <span className="ml-2 truncate font-mono text-xs text-subtle">linkedin.com/jobs/view/…</span>
                        </div>

                        <ul className="space-y-3">
                            {PIPELINE_STEPS.map((s, i) => {
                                const Icon = s.icon;
                                return (
                                    <motion.li
                                        key={s.label}
                                        initial={{ opacity: 0, x: -12 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.4, delay: 0.4 + i * 0.12, ease: EASE }}
                                        className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/2 p-3"
                                    >
                                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                                            <Icon className="size-4" aria-hidden="true" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-semibold">{s.label}</span>
                                            <span className="block truncate text-xs text-subtle">{s.detail}</span>
                                        </span>
                                        <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                                    </motion.li>
                                );
                            })}
                        </ul>

                        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-brand/8 p-3">
                            <span className="text-sm font-semibold text-brand">Draft ready for your review</span>
                            <Zap className="size-4 shrink-0 text-brand" aria-hidden="true" />
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ── Metrics ───────────────────────────────────────────────────── */}
            <section className="border-y border-white/6 py-14">
                <div className="shell grid gap-8 text-center sm:grid-cols-3">
                    {METRICS.map((m) => (
                        <motion.div key={m.label} {...RISE}>
                            <p className="text-3xl font-extrabold tracking-tight text-brand sm:text-4xl" data-numeric>{m.value}</p>
                            <p className="mt-2 text-sm text-muted">{m.label}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* ── How it works ──────────────────────────────────────────────── */}
            <section className="py-20 sm:py-28">
                <div className="shell">
                    <motion.header {...RISE} className="mx-auto mb-14 max-w-2xl text-center">
                        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">From a URL to their inbox</h2>
                        <p className="mt-4 text-muted">Four steps that normally cost you an hour per application.</p>
                    </motion.header>

                    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {PIPELINE_STEPS.map((s, i) => {
                            const Icon = s.icon;
                            return (
                                <motion.li
                                    key={s.label}
                                    {...riseDelayed(i * 0.08)}
                                    className="ui-card ui-card-pad"
                                >
                                    <div className="mb-4 flex items-center justify-between">
                                        <span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
                                            <Icon className="size-5" aria-hidden="true" />
                                        </span>
                                        <span className="font-mono text-sm text-subtle" data-numeric>0{i + 1}</span>
                                    </div>
                                    <h3 className="font-bold">{s.label}</h3>
                                    <p className="mt-1.5 text-sm text-muted">{s.detail}</p>
                                </motion.li>
                            );
                        })}
                    </ol>
                </div>
            </section>

            {/* ── Features ──────────────────────────────────────────────────── */}
            <section className="border-t border-white/6 py-20 sm:py-28">
                <div className="shell">
                    <motion.header {...RISE} className="mx-auto mb-14 max-w-2xl text-center">
                        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                            Everything the manual version costs you
                        </h2>
                        <p className="mt-4 text-muted">Built for a real search, not a demo.</p>
                    </motion.header>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {FEATURES.map((f, i) => {
                            const Icon = f.icon;
                            return (
                                <motion.article
                                    key={f.title}
                                    {...riseDelayed((i % 3) * 0.08)}
                                    className="ui-card ui-card-pad transition-colors duration-200 hover:border-brand/25"
                                >
                                    <span className="mb-4 grid size-10 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
                                        <Icon className="size-5" aria-hidden="true" />
                                    </span>
                                    <h3 className="font-bold">{f.title}</h3>
                                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
                                </motion.article>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ── Trust ─────────────────────────────────────────────────────── */}
            <section className="border-t border-white/6 py-20">
                <motion.div {...RISE} className="shell max-w-3xl text-center">
                    <span className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/20">
                        <Lock className="size-6" aria-hidden="true" />
                    </span>
                    <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Your data stays yours</h2>
                    <p className="mx-auto mt-4 max-w-xl text-muted">
                        OAuth sign-in — we never see your password. Your resume is private to your account
                        and is never used to generate anyone else&apos;s CV. Connect your own mailbox and
                        outreach sends from you, with replies landing in your inbox.
                    </p>
                </motion.div>
            </section>

            {/* ── Final CTA ─────────────────────────────────────────────────── */}
            <section className="relative border-t border-white/6 py-24 sm:py-32">
                <div className="aurora" aria-hidden="true" />
                <motion.div {...RISE} className="shell relative max-w-2xl text-center">
                    <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                        Your next job starts with one URL.
                    </h2>
                    <p className="mt-4 text-muted">Free to start. Three outreaches a month, no card.</p>
                    <button type="button" onClick={onStartOnboarding} className="ui-btn ui-btn-primary ui-btn-lg mt-8">
                        Start free
                        <ArrowRight className="size-4" aria-hidden="true" />
                    </button>
                </motion.div>
            </section>

            {/* ── Footer ────────────────────────────────────────────────────── */}
            <footer className="border-t border-white/6 py-10">
                <div className="shell flex flex-col items-center justify-between gap-4 sm:flex-row">
                    <Logo />
                    <p className="text-sm text-subtle">© {new Date().getFullYear()} Outreach.ai</p>
                    {/* min-h-11 + horizontal padding: bare text links rendered
                        only 20px tall, well under the 44px touch minimum. */}
                    <nav className="flex gap-2 text-sm" aria-label="Footer">
                        <Link href="/pricing" className="tap inline-flex min-h-11 items-center rounded-lg px-3 text-muted transition-colors hover:text-text">
                            Pricing
                        </Link>
                        <Link href="/login" className="tap inline-flex min-h-11 items-center rounded-lg px-3 text-muted transition-colors hover:text-text">
                            Log in
                        </Link>
                    </nav>
                </div>
            </footer>
            </div>
        </MotionConfig>
    );
}
