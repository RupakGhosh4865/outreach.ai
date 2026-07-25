'use client';

import { useState, useEffect, useLayoutEffect } from 'react';
import Link from 'next/link';
import {
  ArrowRight, Building2, CheckCircle2, Mail, Send, Sparkles, User, Zap,
} from 'lucide-react';
import LandingPage from './components/LandingPage';
import Onboarding from './components/Onboarding';
import { Badge, Card, EmptyState, Skeleton, Stat } from './components/ui';
import { apiGet } from '@/lib/api';

const STATUS_TONE = {
  sent: 'success',
  draft: 'neutral',
  generated: 'info',
  failed: 'danger',
};

/**
 * useLayoutEffect on the client, useEffect on the server (where it's a no-op and
 * React would otherwise warn). Reading the auth token in a layout effect lets us
 * swap to the dashboard *before* the browser paints, so a signed-in user never
 * sees a flash of the marketing page.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function RecentRow({ job }) {
  return (
    <tr className="border-t border-white/5 transition-colors hover:bg-white/2">
      <td className="px-4 py-4 font-semibold sm:px-6">{job.companyName || '—'}</td>
      <td className="px-4 py-4 text-muted sm:px-6">{job.jobTitle || '—'}</td>
      <td className="px-4 py-4 sm:px-6">
        <Badge tone={STATUS_TONE[job.status] || 'neutral'}>{job.status}</Badge>
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-sm text-subtle sm:px-6">
        <time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleDateString()}</time>
      </td>
    </tr>
  );
}

export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  // Only the 5 most recent rows are fetched, so the count comes from the server.
  const [totalOutreaches, setTotalOutreaches] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);

  // The signed-out landing page is the server-rendered default, so search
  // engines and first paint get real content instead of a loading skeleton.
  useIsomorphicLayoutEffect(() => {
    if (localStorage.getItem('authToken')) setIsLoggedIn(true);
    else setDataLoading(false);
  }, []);

  useEffect(() => {
    if (isLoggedIn) fetchData();
  }, [isLoggedIn]);

  // Both endpoints derive the account from the token, so no email is passed.
  async function fetchData() {
    const [profileRes, historyRes] = await Promise.allSettled([
      apiGet('/api/profile'),
      apiGet('/api/jobs/history?limit=5'),
    ]);
    if (profileRes.status === 'fulfilled') setProfile(profileRes.value.profile);
    if (historyRes.status === 'fulfilled') {
      setHistory(historyRes.value.jobs || []);
      setTotalOutreaches(historyRes.value.total ?? (historyRes.value.jobs || []).length);
    }
    setDataLoading(false);
  }

  const handleFinishOnboarding = (data) => {
    localStorage.setItem('onboarding_data', JSON.stringify(data));
    window.location.href = '/login';
  };

  if (!isLoggedIn) {
    if (showOnboarding) return <Onboarding onFinish={handleFinishOnboarding} />;
    return <LandingPage onStartOnboarding={() => setShowOnboarding(true)} />;
  }

  const stats = {
    total: totalOutreaches,
    sent: history.filter((j) => j.status === 'sent').length,
    companies: [...new Set(history.map((j) => j.companyName).filter(Boolean))].length,
  };

  const firstName = profile?.name?.split(' ')[0];
  const plan = profile?.subscription?.plan || 'free';

  return (
    <div className="shell page-top pb-20">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="animate-fade-up mb-8 sm:mb-10">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Welcome back{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mt-2 text-muted">
          {stats.total > 0
            ? `${stats.total} outreach${stats.total === 1 ? '' : 'es'} tracked. Ready for the next one?`
            : 'Let’s get your first application out the door.'}
        </p>
      </header>

      {/* ── Primary actions ────────────────────────────────────────────── */}
      <div className="mb-8 grid gap-4 sm:mb-10 sm:grid-cols-2">
        <Card className="group flex flex-col transition-colors duration-200 hover:border-brand/30">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
              <Zap className="size-5" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-bold">Start an outreach</h2>
          </div>
          <p className="mb-6 flex-1 text-sm leading-relaxed text-muted">
            Paste a job link or description. We’ll build a matched CV, find the right
            contact, and draft the email.
          </p>
          <Link href="/outreach" className="ui-btn ui-btn-primary ui-btn-block">
            New outreach
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </Card>

        <Card className="flex flex-col transition-colors duration-200 hover:border-brand/30">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-info/10 text-info ring-1 ring-info/20">
              <User className="size-5" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-bold">Your account</h2>
          </div>
          <div className="mb-6 flex-1">
            <Badge tone={plan === 'free' ? 'brand' : 'success'} icon={Sparkles}>
              {plan} plan
            </Badge>
            {!profile?.resumeOriginalName && (
              <p className="mt-3 text-sm text-warning">
                No resume uploaded yet — emails and CVs will be generic without one.
              </p>
            )}
          </div>
          <Link href="/profile" className="ui-btn ui-btn-secondary ui-btn-block">
            Manage profile
          </Link>
        </Card>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      {/* 2 columns on phones, 3 from lg. The third card spans both columns at the
          2-col size so the row never ends with an orphaned half-width cell. */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:mb-10 lg:grid-cols-3">
        <Stat label="Total outreaches" value={stats.total} icon={Send} tone="brand" />
        <Stat label="Sent" value={stats.sent} icon={CheckCircle2} tone="success" hint="in recent activity" />
        <div className="col-span-2 lg:col-span-1">
          <Stat label="Companies" value={stats.companies} icon={Building2} tone="info" hint="in recent activity" />
        </div>
      </div>

      {/* ── Recent activity ────────────────────────────────────────────── */}
      <section aria-labelledby="recent-heading">
        <Card padded={false} className="overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-white/6 px-5 py-4 sm:px-6">
            <h2 id="recent-heading" className="font-bold">Recent outreach</h2>
            {history.length > 0 && (
              <Link
                href="/history"
                className="tap group inline-flex items-center gap-1 rounded-md text-xs font-bold uppercase tracking-widest text-brand"
              >
                View all
                <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            )}
          </div>

          {dataLoading ? (
            <div className="space-y-3 p-5 sm:p-6">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : history.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="No outreach yet"
              description="Your sent applications and their status will appear here."
              action={<Link href="/outreach" className="ui-btn ui-btn-primary">Create your first outreach</Link>}
            />
          ) : (
            /* Table scrolls inside its own box so the page never scrolls sideways. */
            <div className="scroll-x">
              <table className="w-full min-w-136 text-left text-sm">
                <thead>
                  <tr className="bg-white/2">
                    {['Company', 'Role', 'Status', 'Date'].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="px-4 py-3 text-[0.65rem] font-bold uppercase tracking-widest text-subtle sm:px-6"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((job) => <RecentRow key={job._id} job={job} />)}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
