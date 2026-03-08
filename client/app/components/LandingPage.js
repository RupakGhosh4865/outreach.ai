'use client';
import Link from 'next/link';
import { Zap, ArrowRight, CheckCircle, Sparkles, User, Building2, Send, MessageSquare } from 'lucide-react';
import Image from 'next/image';

export default function LandingPage({ onStartOnboarding }) {
    return (
        <div className="landing-page">
            <div className="glow-tr"></div>
            <div className="glow-bl"></div>

            {/* Hero Section */}
            <section className="hero">
                <div className="hero-content">
                    <div className="badge badge-purple" style={{ marginBottom: 24 }}>
                        <Sparkles size={14} /> AI-Powered Job Applications
                    </div>
                    <h1 className="hero-title">
                        Get hired with <span className="text-lime">Referral AI</span>
                    </h1>
                    <p className="hero-desc">
                        Stop yelling into the void. Use AI to find key decision makers, extract job insights, and write personalized referral requests in 60 seconds.
                    </p>
                    <div className="hero-actions">
                        <button className="btn btn-primary btn-lg" onClick={onStartOnboarding}>
                            Get Started for Free <ArrowRight size={18} />
                        </button>
                        <Link href="/pricing" className="btn btn-secondary btn-lg">View Plans</Link>
                    </div>
                </div>
                <div className="hero-image-wrapper">
                    <img
                        src="/hero_portrait.png"
                        alt="Professional"
                        className="hero-img"
                    />
                    <div className="floating-card top-right card">
                        <Zap size={20} className="text-lime" />
                        <span>Referral found!</span>
                    </div>
                    <div className="floating-card bottom-left card">
                        <Sparkles size={20} className="text-lime" />
                        <span>Email generated</span>
                    </div>
                </div>
            </section>

            {/* Features Preview */}
            <section className="features-grid-section">
                <div className="container">
                    <div className="section-header" style={{ textAlign: 'center', marginBottom: 64 }}>
                        <h2 style={{ fontSize: '2.5rem', fontFamily: 'var(--font-space-grotesk)' }}>Built for professionals</h2>
                        <p style={{ color: 'var(--muted-foreground)', maxWidth: 600, margin: '16px auto' }}>
                            We automated the most tedious parts of job hunting.
                        </p>
                    </div>
                    <div className="features-grid">
                        <div className="card feature-card">
                            <div className="icon-box"><Zap size={24} /></div>
                            <h3>1-Click Outreach</h3>
                            <p>Paste a LinkedIn URL and let our AI do the heavy lifting from discovery to send.</p>
                        </div>
                        <div className="card feature-card">
                            <div className="icon-box"><User size={24} /></div>
                            <h3>Contact Search</h3>
                            <p>Automatically find hiring managers and recruiters at any target company.</p>
                        </div>
                        <div className="card feature-card">
                            <div className="icon-box"><MessageSquare size={24} /></div>
                            <h3>AI Personalization</h3>
                            <p>No more templates. AI writes custom requests based on your profile and their job.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* How it Works Section - Split Screen */}
            <section className="how-it-works">
                <div className="split-panel">
                    <div className="panel-image">
                        <img src="/how_it_works_ui.png" alt="UI Dashboard" className="ui-mockup" />
                    </div>
                    <div className="panel-content">
                        <h2 className="section-title">Scale your applications</h2>
                        <div className="step-list">
                            <div className="step-point">
                                <div className="step-num">01</div>
                                <div className="step-text">
                                    <h4>Connect your Profile</h4>
                                    <p>Sync your resume and target roles once.</p>
                                </div>
                            </div>
                            <div className="step-point">
                                <div className="step-num">02</div>
                                <div className="step-text">
                                    <h4>Find Opportunities</h4>
                                    <p>Browse job boards or paste direct LinkedIn links.</p>
                                </div>
                            </div>
                            <div className="step-point">
                                <div className="step-num">03</div>
                                <div className="step-text">
                                    <h4>Automatic Outreach</h4>
                                    <p>Our agent finds internal contacts and emails them.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <style jsx>{`
                .hero {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 48px;
                    padding: 80px 48px;
                    min-height: calc(100vh - 64px);
                    align-items: center;
                    max-width: 1400px;
                    margin: 0 auto;
                }
                .hero-title {
                    font-family: var(--font-space-grotesk);
                    font-size: clamp(3rem, 6vw, 5rem);
                    font-weight: 600;
                    line-height: 1;
                    margin-bottom: 24px;
                    color: var(--foreground);
                }
                .text-lime { color: var(--primary); }
                .hero-desc {
                    font-size: 1.25rem;
                    color: var(--muted-foreground);
                    max-width: 500px;
                    margin-bottom: 40px;
                }
                .hero-actions {
                    display: flex;
                    gap: 16px;
                }
                .hero-image-wrapper {
                    position: relative;
                    height: 600px;
                }
                .hero-img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    border-radius: 24px;
                    filter: grayscale(0.5);
                }
                .hero-image-wrapper::after {
                    content: "";
                    position: absolute;
                    inset: 0;
                    box-shadow: inset 0 0 100px rgba(11, 12, 16, 1);
                    border-radius: 24px;
                }
                .floating-card {
                    position: absolute;
                    padding: 12px 20px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-weight: 600;
                    backdrop-filter: blur(12px);
                    background: rgba(20, 22, 27, 0.8);
                }
                .top-right { top: 10%; right: -5%; }
                .bottom-left { bottom: 15%; left: -5%; }

                .features-grid-section { padding: 96px 0; }
                .features-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 24px;
                }
                .feature-card h3 {
                    font-family: var(--font-space-grotesk);
                    font-size: 1.5rem;
                    margin: 20px 0 12px;
                }
                .icon-box {
                    width: 48px;
                    height: 48px;
                    background: rgba(185, 255, 44, 0.1);
                    color: var(--primary);
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .how-it-works { background: var(--card); padding: 96px 0; }
                .split-panel {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 64px;
                    max-width: 1200px;
                    margin: 0 auto;
                    align-items: center;
                }
                .ui-mockup { width: 100%; border-radius: 18px; box-shadow: 0 30px 60px rgba(0,0,0,0.5); }
                .section-title {
                    font-family: var(--font-space-grotesk);
                    font-size: 3rem;
                    margin-bottom: 40px;
                }
                .step-list { display: flex; flex-direction: column; gap: 32px; }
                .step-point { display: flex; gap: 24px; }
                .step-num {
                    font-family: var(--font-space-grotesk);
                    font-size: 1.5rem;
                    color: var(--primary);
                    opacity: 0.5;
                }
                .step-text h4 { font-size: 1.25rem; margin-bottom: 8px; }

                @media (max-width: 1024px) {
                    .hero, .split-panel { grid-template-columns: 1fr; }
                    .hero { padding: 40px 24px; text-align: center; }
                    .hero-desc { margin: 0 auto 40px; }
                    .hero-actions { justify-content: center; }
                    .features-grid { grid-template-columns: 1fr; }
                }
            `}</style>
        </div>
    );
}
