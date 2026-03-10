'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Zap, Sparkles } from 'lucide-react';
import LandingPage from './components/LandingPage';
import Onboarding from './components/Onboarding';

const API = 'http://localhost:5000';

export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const userEmail = localStorage.getItem('jobreach_email');

    if (token) {
      setIsLoggedIn(true);
      if (userEmail) fetchData(userEmail, token);
    }
    setLoading(false);
  }, []);

  async function fetchData(email, token) {
    try {
      const [pRes, hRes] = await Promise.all([
        fetch(`${API}/api/profile?email=${encodeURIComponent(email)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API}/api/jobs/history?userEmail=${encodeURIComponent(email)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
      ]);
      if (pRes.ok) { const d = await pRes.json(); setProfile(d.profile); }
      if (hRes.ok) { const d = await hRes.json(); setHistory(d.jobs || []); }
    } catch { /* server might be off */ }
  }

  const handleStartOnboarding = () => setShowOnboarding(true);

  const handleFinishOnboarding = (data) => {
    // Save onboarding data temporarily or send to API
    localStorage.setItem('onboarding_data', JSON.stringify(data));
    window.location.href = '/login';
  };

  if (loading) return <div className="page"><div className="container">Loading...</div></div>;

  if (!isLoggedIn) {
    if (showOnboarding) {
      return <Onboarding onFinish={handleFinishOnboarding} />;
    }
    return <LandingPage onStartOnboarding={handleStartOnboarding} />;
  }

  const stats = {
    total: history.length,
    sent: history.filter(j => j.status === 'sent').length,
    companies: [...new Set(history.map(j => j.companyName).filter(Boolean))].length,
  };

  return (
    <main className="page">
      <div className="section-container">
        <header className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight mb-3">
            Welcome back{profile ? `, ${profile.name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-white/40 text-lg">
            You have {stats.total} outreaches tracked. Ready to find your next role?
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <div className="bg-[#0F2137] border border-white/5 rounded-2xl p-8 hover:border-[#A8E063]/30 transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#A8E063]/10 flex items-center justify-center text-[#A8E063]">
                <Zap size={20} />
              </div>
              <h3 className="text-white font-bold text-lg">Fast Action</h3>
            </div>
            <p className="text-white/40 text-sm mb-8 leading-relaxed">
              Paste a LinkedIn URL and start a new automated outreach campaign.
            </p>
            <Link href="/outreach" className="flex items-center justify-center w-full py-4 bg-[#A8E063] hover:bg-[#7EC63A] text-[#060D18] font-bold rounded-lg transition-all no-underline">
              New Outreach
            </Link>
          </div>

          <div className="bg-[#0F2137] border border-white/5 rounded-2xl p-8 hover:border-[#A8E063]/30 transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#A8E063]/10 flex items-center justify-center text-[#A8E063]">
                <Sparkles size={20} />
              </div>
              <h3 className="text-white font-bold text-lg">Account</h3>
            </div>
            <div className="mb-8">
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${profile?.subscription?.plan === 'free' ? 'bg-[#A8E063]/10 text-[#A8E063] border border-[#A8E063]/20' : 'bg-[#7EC63A] text-black'}`}>
                {profile?.subscription?.plan || 'Free'} Plan
              </span>
            </div>
            <Link href="/profile" className="flex items-center justify-center w-full py-4 border border-white/10 hover:border-white/20 text-white font-bold rounded-lg transition-all no-underline">
              Manage Profile
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {[
            { label: 'Total Outreaches', value: stats.total },
            { label: 'Emails Sent', value: stats.sent },
            { label: 'Companies', value: stats.companies },
          ].map((stat, i) => (
            <div key={i} className="bg-[#0F2137] border border-white/5 rounded-2xl p-8 text-center md:text-left">
              <div className="text-white/30 text-xs font-bold uppercase tracking-widest mb-2">{stat.label}</div>
              <div className="text-[#A8E063] text-4xl font-extrabold tracking-tight">{stat.value}</div>
            </div>
          ))}
        </div>

        {history.length > 0 && (
          <div className="bg-[#0F2137] border border-white/5 rounded-2xl overflow-hidden">
            <div className="px-8 py-6 border-b border-white/[0.06] flex justify-between items-center">
              <h3 className="text-white font-bold">Recent Outreach</h3>
              <Link href="/history" className="text-[#A8E063] text-xs font-bold uppercase tracking-widest hover:translate-x-1 transition-transform inline-block no-underline">View All →</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white/[0.02]">
                    <th className="px-8 py-4 text-[10px] uppercase tracking-widest text-white/30 font-bold">Company</th>
                    <th className="px-8 py-4 text-[10px] uppercase tracking-widest text-white/30 font-bold">Role</th>
                    <th className="px-8 py-4 text-[10px] uppercase tracking-widest text-white/30 font-bold">Status</th>
                    <th className="px-8 py-4 text-[10px] uppercase tracking-widest text-white/30 font-bold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {history.slice(0, 5).map(j => (
                    <tr key={j._id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-8 py-5 text-sm font-bold text-white">{j.companyName}</td>
                      <td className="px-8 py-5 text-sm text-white/50">{j.jobTitle}</td>
                      <td className="px-8 py-5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter ${j.status === 'sent' ? 'bg-[#A8E063]/10 text-[#A8E063]' : 'bg-red-500/10 text-red-500'}`}>
                          {j.status}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-sm text-white/30 font-mono italic">{new Date(j.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <style jsx>{`
                .no-underline { text-decoration: none; }
            `}</style>
    </main>
  );
}