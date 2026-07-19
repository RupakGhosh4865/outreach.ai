'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';

const API = 'http://localhost:5000';

const EMAIL_TYPE_LABELS = {
    referral: '🤝 Referral',
    direct_apply: '📨 Direct Apply',
    vacancy_inquiry: '🔍 Vacancy Inquiry',
};

export default function HistoryPage() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);
    const [userEmail, setUserEmail] = useState('');

    useEffect(() => {
        const saved = localStorage.getItem('jobreach_email');
        if (saved) {
            setUserEmail(saved);
            fetchHistory(saved);
        }
    }, []);

    async function fetchHistory(email) {
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/jobs/history?userEmail=${encodeURIComponent(email)}`);
            const data = await res.json();
            setJobs(data.jobs || []);
        } catch { }
        setLoading(false);
    }

    const stats = {
        total: jobs.length,
        sent: jobs.filter(j => j.status === 'sent').length,
        totalEmails: jobs.reduce((sum, j) => sum + (j.sentTo?.length || 0), 0),
        companies: [...new Set(jobs.map(j => j.companyName).filter(Boolean))].length,
    };

    // Human-readable apply time (createdAt → sentAt)
    function applyTime(job) {
        if (!job.sentAt || !job.createdAt) return null;
        const ms = new Date(job.sentAt) - new Date(job.createdAt);
        if (ms < 0) return null;
        const secs = Math.floor(ms / 1000);
        if (secs < 60) return `${secs}s`;
        const mins = Math.floor(secs / 60);
        const rem  = secs % 60;
        return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
    }

    return (
        <AuthGuard>
            <main className="page">
                <div className="container">
                    <div className="page-header">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                            <div>
                                <h1>Outreach History</h1>
                                <p>All your past job outreach emails and their status</p>
                            </div>
                            <Link href="/outreach" className="btn btn-primary">+ New Outreach</Link>
                        </div>
                    </div>

                    {!userEmail && (
                        <div className="alert alert-warning">
                            ⚠ No profile loaded. <Link href="/" style={{ color: 'var(--accent)' }}>Go to dashboard →</Link>
                        </div>
                    )}

                    {userEmail && (
                        <>
                            <div className="stats-row">
                                <div className="stat-card"><div className="stat-value">{stats.total}</div><div className="stat-label">Total Outreaches</div></div>
                                <div className="stat-card"><div className="stat-value">{stats.sent}</div><div className="stat-label">Successful</div></div>
                                <div className="stat-card"><div className="stat-value">{stats.totalEmails}</div><div className="stat-label">Emails Delivered</div></div>
                                <div className="stat-card"><div className="stat-value">{stats.companies}</div><div className="stat-label">Companies</div></div>
                            </div>

                            {loading ? (
                                <div style={{ textAlign: 'center', padding: 60 }}>
                                    <div className="spinner" style={{ margin: '0 auto', width: 36, height: 36, borderWidth: 3 }} />
                                </div>
                            ) : jobs.length === 0 ? (
                                <div className="card">
                                    <div className="empty-state">
                                        <div className="empty-icon">📭</div>
                                        <h3>No outreach yet</h3>
                                        <p>Start your first job outreach to see it here</p>
                                        <Link href="/outreach" className="btn btn-primary">Create First Outreach</Link>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: 20, gridTemplateColumns: selected ? '1fr 1fr' : '1fr' }}>
                                    {/* Table */}
                                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                        <div className="table-wrap">
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>Company</th>
                                                         <th>Role</th>
                                                         <th>Type</th>
                                                         <th>Recipients</th>
                                                         <th>Resume</th>
                                                         <th>Apply Time</th>
                                                         <th>Follow-Up</th>
                                                         <th>Status</th>
                                                         <th>Date</th>
                                                         <th></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {jobs.map(j => (
                                                        <tr key={j._id} style={{ cursor: 'pointer' }} onClick={() => setSelected(j)}>
                                                            <td>
                                                                <div style={{ fontWeight: 600 }}>{j.companyName || '—'}</div>
                                                                {j.companyDomain && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{j.companyDomain}</div>}
                                                            </td>
                                                            <td>{j.jobTitle || '—'}</td>
                                                            <td>
                                                                <span className="badge badge-purple">
                                                                    {EMAIL_TYPE_LABELS[j.emailType] || j.emailType}
                                                                </span>
                                                            </td>
                                                            <td>{j.sentTo?.length || 0}</td>
                                                             {/* Resume optimization badge */}
                                                             <td>
                                                                 {j.optimizedResumeUsed ? (
                                                                     <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                                         <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>
                                                                             {j.optimizedResumeUsed === 'genai' ? '🤖 GenAI' : '⚙️ Backend'}
                                                                         </span>
                                                                         {j.optimizedMatchScore && (
                                                                             <span style={{ fontSize: '0.65rem', color: '#10b981' }}>{j.optimizedMatchScore}% ATS</span>
                                                                         )}
                                                                     </div>
                                                                 ) : (
                                                                     <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                                                                 )}
                                                             </td>
                                                             {/* Apply time */}
                                                             <td>
                                                                 {applyTime(j) ? (
                                                                     <span style={{ fontSize: '0.8rem', color: '#a5b4fc', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                         ⏱ {applyTime(j)}
                                                                     </span>
                                                                 ) : (
                                                                     <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                                                                 )}
                                                             </td>
                                                            <td>
                                                                {j.followUpDays !== 0 ? (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                                        <span className={`badge ${j.followUpStatus === 'due' ? 'badge-red' : j.followUpStatus === 'sent' ? 'badge-green' : j.followUpStatus === 'purple'}`} style={{ fontSize: '0.7rem' }}>
                                                                            {j.followUpStatus === 'pending'
                                                                                ? (j.followUpDays === -1 ? 'In 2m' : `In ${j.followUpDays}d`)
                                                                                : j.followUpStatus
                                                                            }
                                                                        </span>
                                                                        {j.followUpDate && (
                                                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                                                                {j.followUpDays === -1
                                                                                    ? new Date(j.followUpDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                                                    : new Date(j.followUpDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                                                                                }
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No</span>
                                                                )}
                                                            </td>
                                                            <td>
                                                                <span className={`badge ${j.status === 'sent' ? 'badge-green' : j.status === 'failed' ? 'badge-red' : 'badge-yellow'}`}>
                                                                    {j.status}
                                                                </span>
                                                            </td>
                                                            <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                                {new Date(j.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            </td>
                                                            <td>
                                                                <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); setSelected(j); }}>
                                                                    View
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Side panel – email details */}
                                    {selected && (
                                        <div className="card" style={{ position: 'sticky', top: 80, height: 'fit-content' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                                <div className="card-title" style={{ marginBottom: 0 }}>
                                                    <span className="icon">📧</span> Email Details
                                                </div>
                                                <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>✕</button>
                                            </div>

                                            <div style={{ marginBottom: 12 }}>
                                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>COMPANY</div>
                                                <div style={{ fontWeight: 700 }}>{selected.companyName || '—'}</div>
                                            </div>

                                            <div style={{ marginBottom: 12 }}>
                                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>ROLE</div>
                                                <div>{selected.jobTitle || '—'}</div>
                                            </div>

                                            <div style={{ marginBottom: 12 }}>
                                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>SENT TO</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                    {(selected.sentTo || []).map(email => (
                                                        <span key={email} className="badge badge-green">{email}</span>
                                                    ))}
                                                    {(selected.sentTo || []).length === 0 && <span className="badge badge-red">Not sent</span>}
                                                </div>
                                            </div>

                                             {/* Resume optimization detail */}
                                             {selected.optimizedResumeUsed && (
                                                 <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(16,185,129,0.06)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.2)' }}>
                                                     <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                                                         🧬 RESUME USED
                                                     </div>
                                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                         <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                                                             {selected.optimizedResumeUsed === 'genai' ? '🤖 Gen AI Resume' : '⚙️ Backend Resume'}
                                                         </span>
                                                         {selected.optimizedMatchScore && (
                                                             <span className="badge badge-green">{selected.optimizedMatchScore}% ATS Match</span>
                                                         )}
                                                     </div>
                                                 </div>
                                             )}

                                             {/* Apply time detail */}
                                             {applyTime(selected) && (
                                                 <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(165,180,252,0.06)', borderRadius: 10, border: '1px solid rgba(165,180,252,0.15)' }}>
                                                     <div style={{ fontSize: '0.7rem', color: '#a5b4fc', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                                                         ⏱ APPLY TIME
                                                     </div>
                                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                         <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Time from start to send</span>
                                                         <span style={{ fontSize: '1rem', fontWeight: 700, color: '#a5b4fc' }}>{applyTime(selected)}</span>
                                                     </div>
                                                 </div>
                                             )}

                                            {selected.followUpDays > 0 && (
                                                <div style={{ marginBottom: 16, padding: '12px', background: 'rgba(108, 99, 255, 0.05)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                                                        ⏰ FOLLOW-UP REMINDER
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.85rem' }}>
                                                            {selected.followUpStatus === 'pending' ? `Scheduled for ${selected.followUpDays} days after send` : `Status: ${selected.followUpStatus}`}
                                                        </span>
                                                        <span className={`badge ${selected.followUpStatus === 'due' ? 'badge-red' : 'badge-purple'}`}>
                                                            {new Date(selected.followUpDate).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            {selected.generatedEmailSubject && (
                                                <div style={{ marginBottom: 8 }}>
                                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>SUBJECT</div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selected.generatedEmailSubject}</div>
                                                </div>
                                            )}

                                            {selected.generatedEmailBody && (
                                                <div>
                                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>EMAIL BODY</div>
                                                    <div className="email-preview">
                                                        <div className="email-preview-header">
                                                            <div className="email-dot" style={{ background: '#ef4444' }} />
                                                            <div className="email-dot" style={{ background: '#f59e0b' }} />
                                                            <div className="email-dot" style={{ background: '#22c55e' }} />
                                                        </div>
                                                        <div className="email-preview-body" style={{ maxHeight: 300, overflowY: 'auto' }}>
                                                            {selected.generatedEmailBody}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>
        </AuthGuard>
    );
}
