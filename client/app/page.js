'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
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
      <div className="glow-tr"></div>
      <div className="glow-bl"></div>

      <div className="container">
        <div className="page-header">
          <h1>Welcome back{profile ? `, ${profile.name.split(' ')[0]}` : ''}</h1>
          <p>You have {stats.total} outreaches tracked. Ready to find your next role?</p>
        </div>

        {/* Profile/Upgrade Quick Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
          <div className="card">
            <div className="card-title"><span className="icon">🚀</span> Fast Action</div>
            <p style={{ color: 'var(--muted-foreground)', marginBottom: 24 }}>Paste a LinkedIn URL and start a new automated outreach campaign.</p>
            <Link href="/outreach" className="btn btn-primary btn-full">New Outreach</Link>
          </div>
          <div className="card">
            <div className="card-title"><span className="icon">✨</span> Account</div>
            <div style={{ marginBottom: 16 }}>
              <span className={`badge ${profile?.subscription?.plan === 'free' ? 'badge-purple' : 'badge-green'}`}>
                {profile?.subscription?.plan || 'Free'} Plan
              </span>
            </div>
            <Link href="/profile" className="btn btn-secondary btn-full">Manage Profile</Link>
          </div>
        </div>

        {/* Stats Section */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Outreaches</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.sent}</div>
            <div className="stat-label">Emails Sent</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.companies}</div>
            <div className="stat-label">Companies</div>
          </div>
        </div>

        {/* Recent History */}
        {history.length > 0 && (
          <div className="card">
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <span>Recent Outreach</span>
              <Link href="/history" className="btn btn-secondary btn-sm">View All</Link>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 5).map(j => (
                    <tr key={j._id}>
                      <td style={{ fontWeight: 600 }}>{j.companyName}</td>
                      <td>{j.jobTitle}</td>
                      <td>
                        <span className={`badge ${j.status === 'sent' ? 'badge-green' : 'badge-red'}`}>
                          {j.status}
                        </span>
                      </td>
                      <td style={{ color: 'var(--muted-foreground)' }}>{new Date(j.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}