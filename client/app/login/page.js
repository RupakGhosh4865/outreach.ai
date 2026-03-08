'use client';
import { Sparkles, Zap } from 'lucide-react';

export default function LoginPage() {
    return (
        <main className="page">
            <div className="glow-tr"></div>
            <div className="glow-bl"></div>

            <div className="container" style={{ maxWidth: 480, paddingTop: 100 }}>
                <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                    <div className="logo-icon" style={{ margin: '0 auto 24px', width: 48, height: 48 }}>
                        <Zap size={28} fill="currentColor" />
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: '2rem', marginBottom: 12 }}>
                        Welcome to <span style={{ color: 'var(--primary)' }}>JobApply AI</span>
                    </h1>
                    <p style={{ color: 'var(--muted-foreground)', marginBottom: 40 }}>
                        The most powerful way to automate your job outreach. Sign in to access your dashboard.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <a href="http://localhost:5000/api/auth/google" className="auth-btn google btn-lg" style={{ justifyContent: 'center' }}>
                            <img src="https://www.google.com/favicon.ico" width="20" height="20" alt="Google" />
                            Sign in with Google
                        </a>
                        <a href="http://localhost:5000/api/auth/linkedin" className="auth-btn linkedin btn-lg" style={{ justifyContent: 'center' }}>
                            <img src="https://content.linkedin.com/content/dam/me/business/en-us/amp/brand-site/v2/bg/LI-Bug.svg.original.svg" width="20" height="20" alt="LinkedIn" />
                            Sign in with LinkedIn
                        </a>
                    </div>

                    <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
                        <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                            <Sparkles size={14} style={{ marginRight: 4, display: 'inline' }} />
                            Free plan includes 3 outreaches / month
                        </p>
                    </div>
                </div>
            </div>

            <style jsx>{`
                .auth-btn {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px;
                    border-radius: 12px;
                    font-weight: 600;
                    font-size: 1rem;
                    transition: all 0.2s;
                    text-decoration: none;
                }
                .google { background: white; color: #000; }
                .google:hover { background: #f5f5f5; transform: translateY(-2px); }
                .linkedin { background: #0077b5; color: white; }
                .linkedin:hover { background: #005f91; transform: translateY(-2px); }
            `}</style>
        </main >
    );
}
