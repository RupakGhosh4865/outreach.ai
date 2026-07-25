'use client';

import Link from 'next/link';
import { Check, Sparkles } from 'lucide-react';
import { Badge, Card, cn } from '../components/ui';

/**
 * Paid tiers are defined server-side (services/pipeline.js PLAN_LIMITS) but
 * billing isn't wired up yet, so only the free plan is presented as available.
 * The others are shown as "coming soon" rather than as buyable.
 */
const PLANS = [
    {
        name: 'Free',
        price: '£0',
        period: 'forever',
        available: true,
        description: 'Enough to see whether this works for you.',
        features: [
            '3 campaigns a month',
            '5 emails per campaign',
            'Job-matched CV generation',
            'ATS match scoring',
            'Automatic follow-ups',
        ],
    },
    {
        name: 'Starter',
        price: '£4.99',
        period: 'per month',
        popular: true,
        description: 'For an active search.',
        features: [
            '20 campaigns a month',
            '10 emails per campaign',
            'Every outreach type',
            'Job Radar across all sources',
            'Send from your own mailbox',
        ],
    },
    {
        name: 'Pro',
        price: '£9.99',
        period: 'per month',
        description: 'For a serious, sustained search.',
        features: [
            'Unlimited campaigns',
            '15 emails per campaign',
            'Priority AI processing',
            'Reply tracking and analytics',
            'Everything in Starter',
        ],
    },
];

export default function PricingPage() {
    return (
        <div className="relative">
            <div className="aurora" aria-hidden="true" />

            <div className="shell page-top relative pb-24">
                <header className="animate-fade-up mx-auto mb-12 max-w-2xl text-center">
                    <Badge tone="brand" icon={Sparkles} className="mb-4">Pricing</Badge>
                    <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                        Start free. Upgrade when it&apos;s working.
                    </h1>
                    <p className="mt-4 text-muted">
                        No card required to begin. Paid plans aren&apos;t live yet — the free plan is fully functional.
                    </p>
                </header>

                <div className="mx-auto grid max-w-5xl items-start gap-5 lg:grid-cols-3">
                    {PLANS.map((plan) => (
                        <Card
                            key={plan.name}
                            className={cn(
                                'relative flex h-full flex-col',
                                plan.popular && 'border-brand/40 shadow-glow',
                                !plan.available && 'opacity-75',
                            )}
                        >
                            {plan.popular && (
                                <span className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <Badge tone="brand">Most popular</Badge>
                                </span>
                            )}

                            <div className="mb-5">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-bold">{plan.name}</h2>
                                    {!plan.available && <Badge tone="neutral">Coming soon</Badge>}
                                </div>
                                <p className="mt-1 text-sm text-subtle">{plan.description}</p>
                            </div>

                            <p className="mb-6 flex items-baseline gap-1.5">
                                <span className="text-4xl font-extrabold tracking-tight" data-numeric>{plan.price}</span>
                                <span className="text-sm text-subtle">{plan.period}</span>
                            </p>

                            <ul className="mb-8 flex-1 space-y-3">
                                {plan.features.map((f) => (
                                    <li key={f} className="flex gap-2.5 text-sm">
                                        <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                                        <span className="text-muted">{f}</span>
                                    </li>
                                ))}
                            </ul>

                            {plan.available ? (
                                <Link href="/outreach" className="ui-btn ui-btn-primary ui-btn-block">
                                    Get started free
                                </Link>
                            ) : (
                                <button type="button" disabled className="ui-btn ui-btn-secondary ui-btn-block">
                                    Not available yet
                                </button>
                            )}
                        </Card>
                    ))}
                </div>

                <p className="mt-12 text-center text-sm text-subtle">
                    Questions? <Link href="/" className="font-semibold text-brand underline underline-offset-2">Back to dashboard</Link>
                </p>
            </div>
        </div>
    );
}
