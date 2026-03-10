'use client';
import React from 'react';
import { Sparkles, Zap, ShieldCheck } from 'lucide-react';

// --- LOGO COMPONENT (Inlined for consistency) ---
function Logo() {
    return (
        <div className="flex items-center gap-2.5">
            <div className="relative w-8 h-8 flex items-center justify-center">
                <div className="absolute inset-0 bg-[#A8E063]/20 rounded-lg rotate-[8deg]" />
                <div className="relative w-7 h-7 bg-gradient-to-br from-[#A8E063] to-[#7EC63A] rounded-[7px] rotate-[8deg] flex items-center justify-center">
                    <span className="-rotate-[8deg] text-[#060D18] font-black text-sm leading-none">O</span>
                </div>
            </div>
            <div className="flex items-center group">
                <span className="font-inter font-bold text-[17px] tracking-[-0.02em] text-white">outreach</span>
                <span className="font-inter font-bold text-[17px] tracking-[-0.02em] text-[#A8E063]">.ai</span>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <main className="min-h-screen bg-[#060D18] flex items-center justify-center p-6 relative overflow-hidden">
            {/* Subtle background orb */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#A8E063]/[0.02] blur-[120px] pointer-events-none" />

            <div className="w-full max-w-[440px] relative z-10">
                {/* <div className="flex justify-center mb-12">
                    <Logo />
                </div> */}

                <div className="bg-[#0F2137] border border-white/5 rounded-2xl p-8 md:p-10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.4)]">
                    <div className="text-center mb-10">
                        <h1 className="text-2xl font-bold tracking-tight mb-3">Welcome back</h1>
                        <p className="text-white/40 text-sm leading-relaxed">
                            Sign in to Outreach.ai to manage your job search pipeline.
                        </p>
                    </div>

                    <div className="flex flex-col gap-4">
                        <a href="http://localhost:5000/api/auth/google" className="auth-btn google">
                            <img src="https://www.google.com/favicon.ico" width="18" height="18" alt="Google" />
                            Continue with Google
                        </a>
                        <a href="http://localhost:5000/api/auth/linkedin" className="auth-btn linkedin">
                            <img src="https://content.linkedin.com/content/dam/me/business/en-us/amp/brand-site/v2/bg/LI-Bug.svg.original.svg" width="18" height="18" alt="LinkedIn" />
                            Continue with LinkedIn
                        </a>
                    </div>

                    <div className="mt-10 pt-8 border-t border-white/5 flex flex-col gap-4 text-center">
                        <div className="flex items-center justify-center gap-2 text-[#A8E063]">
                            <ShieldCheck size={16} />
                            <span className="text-[11px] font-bold uppercase tracking-widest">Secure OAuth Login</span>
                        </div>
                        <p className="text-[11px] text-white/20 leading-relaxed font-medium">
                            By continuing, you agree to our Terms of Service and Privacy Policy.
                            We never store your passwords.
                        </p>
                    </div>
                </div>

                <div className="mt-8 text-center">
                    <p className="text-white/30 text-xs flex items-center justify-center gap-2">
                        <Sparkles size={12} className="text-[#A8E063]" />
                        Free plan includes 3 outreaches / month
                    </p>
                </div>
            </div>

            <style jsx>{`
                .auth-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    width: 100%;
                    padding: 14px;
                    border-radius: 8px;
                    font-weight: 600;
                    font-size: 14px;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    text-decoration: none;
                }
                .google { 
                    background: white; 
                    color: #0F172A; 
                }
                .google:hover { 
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(255,255,255,0.1);
                }
                .linkedin { 
                    background: #0077B5; 
                    color: white; 
                }
                .linkedin:hover { 
                    background: #006399;
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(0,119,181,0.2);
                }
                h1 { 
                    font-size: 24px;
                    color: white;
                    letter-spacing: -0.02em;
                }
            `}</style>
        </main>
    );
}
