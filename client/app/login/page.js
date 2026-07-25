'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { Alert } from '../components/ui';
import { apiUrl } from '@/lib/api';

function Logo() {
    return (
        <span className="flex items-center gap-2.5">
            <span className="relative grid size-9 place-items-center">
                <span className="absolute inset-0 rotate-[8deg] rounded-lg bg-brand/20" aria-hidden="true" />
                <span className="relative grid size-8 rotate-[8deg] place-items-center rounded-lg bg-linear-to-br from-brand to-[#7ec63a]">
                    <span className="-rotate-[8deg] font-black leading-none text-brand-ink">O</span>
                </span>
            </span>
            <span className="text-lg font-bold tracking-[-0.02em]">
                outreach<span className="text-brand">.ai</span>
            </span>
        </span>
    );
}

const ERRORS = {
    auth_failed: 'That sign-in didn’t complete. Please try again.',
    linkedin_not_configured: 'LinkedIn sign-in isn’t configured on this deployment. Use Google instead.',
};

function LoginInner() {
    const params = useSearchParams();
    const error = params.get('error');

    // Tell the API which origin to send us back to. In dev, Next moves to
    // another port when 3000 is taken, and a redirect to a hardcoded CLIENT_URL
    // would then deliver the token to a port nothing is listening on.
    // Starts empty so the first client render matches SSR (no hydration
    // mismatch); the effect fills it in before anyone can click.
    const [origin, setOrigin] = useState('');
    useEffect(() => setOrigin(window.location.origin), []);

    const oauthHref = (path) =>
        apiUrl(path) + (origin ? `?origin=${encodeURIComponent(origin)}` : '');

    return (
        <main className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4 sm:p-6">
            <div className="aurora" aria-hidden="true" />

            <div className="relative w-full max-w-[26rem]">
                <div className="mb-8 flex justify-center">
                    <Link href="/" className="tap rounded-lg" aria-label="Outreach.ai home">
                        <Logo />
                    </Link>
                </div>

                <div className="ui-card p-6 sm:p-8">
                    <div className="mb-8 text-center">
                        <h1 className="text-2xl font-extrabold tracking-tight">Welcome back</h1>
                        <p className="mt-2 text-sm leading-relaxed text-muted">
                            Sign in to manage your job search pipeline.
                        </p>
                    </div>

                    {error && (
                        <Alert tone="danger" className="mb-6">
                            {ERRORS[error] || 'Something went wrong signing you in.'}
                        </Alert>
                    )}

                    <div className="flex flex-col gap-3">
                        {/* Provider marks are inline SVG rather than remote images, so
                            they can't break the layout if the CDN is slow or blocked. */}
                        <a
                            href={oauthHref('/api/auth/google')}
                            className="tap flex min-h-12 items-center justify-center gap-3 rounded-xl bg-white px-4 font-semibold text-[#0f172a] transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
                        >
                            <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
                                <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
                                <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" />
                            </svg>
                            Continue with Google
                        </a>

                        <a
                            href={oauthHref('/api/auth/linkedin')}
                            className="tap flex min-h-12 items-center justify-center gap-3 rounded-xl bg-[#0077b5] px-4 font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#006399] active:translate-y-0"
                        >
                            <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden="true">
                                <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13Zm1.78 13.02H3.55V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z" />
                            </svg>
                            Continue with LinkedIn
                        </a>
                    </div>

                    <div className="mt-8 flex flex-col gap-4 border-t border-white/6 pt-6 text-center">
                        <p className="flex items-center justify-center gap-2 text-brand">
                            <ShieldCheck className="size-4" aria-hidden="true" />
                            <span className="text-[11px] font-bold uppercase tracking-widest">Secure OAuth sign-in</span>
                        </p>
                        <p className="text-[11px] leading-relaxed text-subtle">
                            By continuing you agree to our Terms of Service and Privacy Policy.
                            We never see or store your password.
                        </p>
                    </div>
                </div>

                <p className="mt-6 flex items-center justify-center gap-2 text-xs text-subtle">
                    <Sparkles className="size-3.5 text-brand" aria-hidden="true" />
                    Free plan includes 3 outreaches a month
                </p>
            </div>
        </main>
    );
}

/** useSearchParams needs a Suspense boundary for the production build to prerender. */
export default function LoginPage() {
    return (
        <Suspense fallback={<main className="min-h-dvh" />}>
            <LoginInner />
        </Suspense>
    );
}
