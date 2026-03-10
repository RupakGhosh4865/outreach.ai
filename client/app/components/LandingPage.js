'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Zap, Sparkles, Building2, Mail, Send, CheckCircle,
    ArrowRight, MessageSquare, BarChart3, Clock, LineChart,
    Search, FileText, Share2, ShieldCheck, ChevronRight
} from 'lucide-react';

// --- LOGO COMPONENT ---
function Logo() {
    return (
        <div className="flex items-center gap-2.5 group cursor-pointer">
            <div className="relative w-8 h-8 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                <div className="absolute inset-0 bg-[#A8E063]/20 rounded-lg rotate-[8deg] group-hover:bg-[#A8E063]/30 transition-colors duration-300" />
                <div className="relative w-7 h-7 bg-gradient-to-br from-[#A8E063] to-[#7EC63A] rounded-[7px] rotate-[8deg] flex items-center justify-center shadow-[0_0_16px_rgba(168,224,99,0.4)] group-hover:shadow-[0_0_24px_rgba(168,224,99,0.6)] transition-shadow duration-300">
                    <span className="-rotate-[8deg] text-[#060D18] font-black text-sm leading-none">O</span>
                </div>
            </div>
            <div className="flex items-center">
                <span className="font-['Inter'] font-bold text-[17px] tracking-[-0.02em] text-white group-hover:text-[#A8E063] transition-colors duration-200">outreach</span>
                <span className="font-['Inter'] font-bold text-[17px] tracking-[-0.02em] text-[#A8E063]">.ai</span>
            </div>
        </div>
    );
}

// --- ANIMATION VARIANTS ---
const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: (i = 0) => ({
        opacity: 1, y: 0,
        transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1], delay: i * 0.1 }
    })
};

const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

// --- PIPELINE DEMO COMPONENT ---
function PipelineDemo() {
    const steps = [
        { icon: Search, label: 'Scanning job URL', color: '#A8E063' },
        { icon: Building2, label: 'Identifying key employees', color: '#A8E063' },
        { icon: FileText, label: 'Parsing resume context', color: '#A8E063' },
        { icon: Mail, label: 'Generating personalized drafts', color: '#A8E063' },
        { icon: Send, label: 'Executing outreach sequence', color: '#7EC63A' }
    ];

    const [activeStep, setActiveStep] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setActiveStep((prev) => (prev + 1) % (steps.length + 1));
        }, 1500);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="flex flex-col gap-6">
            {steps.map((step, i) => (
                <div key={i} className={`flex items-center gap-4 transition-opacity duration-500 ${i <= activeStep ? 'opacity-100' : 'opacity-20'}`}>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${i === activeStep ? 'bg-[#A8E063] text-[#060D18]' : 'bg-[#1a2e4d] text-white'}`}>
                        <step.icon size={20} />
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-semibold tracking-wider uppercase text-white/40">{step.label}</span>
                            <span className="text-[10px] text-[#A8E063] font-mono">{i < activeStep ? 'COMPLETE' : i === activeStep ? 'PROCESSING...' : 'PENDING'}</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-[#A8E063] transition-all duration-1000"
                                style={{ width: i < activeStep ? '100%' : i === activeStep ? '60%' : '0%' }}
                            />
                        </div>
                    </div>
                </div>
            ))}
            {activeStep === steps.length && (
                <div className="mt-4 p-4 border border-[#A8E063]/30 bg-[#A8E063]/5 rounded-xl text-[#A8E063] text-sm font-medium animate-pulse flex items-center gap-3">
                    <CheckCircle size={18} /> Outreach Cycle Successfully Initiated
                </div>
            )}
        </div>
    );
}

// --- PRICING SECTION COMPONENT ---
function PricingSection() {
    const plans = [
        {
            name: 'Free',
            price: '0',
            features: '3 campaigns/mo',
            gm: 'GM —',
            theme: 'border-white/10 text-white',
            btnTheme: 'border-white/20 text-white hover:bg-white/5'
        },
        {
            name: 'Starter',
            nameColor: 'text-[#6366f1]',
            price: '499',
            features: '20 campaigns/mo',
            gm: 'GM 84%',
            theme: 'border-[#6366f1]/30 shadow-[0_0_30px_rgba(99,102,241,0.1)]',
            btnTheme: 'border-[#6366f1]/30 text-[#6366f1] hover:bg-[#6366f1]/5'
        },
        {
            name: 'Pro',
            price: '999',
            features: 'Unlimited',
            gm: 'GM 82%',
            popular: true,
            theme: 'bg-gradient-to-b from-[#a855f7] to-[#6366f1] border-none shadow-[0_0_50px_rgba(168,85,247,0.3)]',
            btnTheme: 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-md'
        },
        {
            name: 'Team',
            nameColor: 'text-[#10b981]',
            price: '2,999',
            features: '5 seats',
            gm: 'GM 80%',
            theme: 'border-[#10b981]/30 shadow-[0_0_30px_rgba(16,185,129,0.1)]',
            btnTheme: 'border-[#10b981]/30 text-[#10b981] hover:bg-[#10b981]/5'
        }
    ];

    return (
        <section id="pricing" className="bg-[#060D18] py-24 relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] bg-[#6366f1]/[0.03] blur-[120px] rounded-full pointer-events-none" />

            <div className="section-container relative z-10">
                <div className="mb-16">
                    <div className="inline-flex items-center px-3 py-1 rounded-md border border-[#6366f1]/30 bg-[#6366f1]/10 mb-8">
                        <span className="text-[#6366f1] text-[10px] font-bold tracking-[0.2em] uppercase">Business Model</span>
                    </div>
                    <h2 className="text-white mb-6">Freemium SaaS — clear revenue path.</h2>

                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
                    {plans.map((plan, i) => (
                        <div key={i} className={`relative flex flex-col p-8 rounded-2xl border transition-all duration-300 hover:-translate-y-1 ${plan.theme}`}>
                            {plan.popular && (
                                <div className="absolute top-0 left-0 right-0 h-10 bg-white/20 backdrop-blur-xl border-b border-white/10 rounded-t-2xl flex items-center justify-center">
                                    <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-white">Most Popular</span>
                                </div>
                            )}
                            <div className={`mt-4 mb-8 text-center`}>
                                <h3 className={`text-xl font-bold mb-6 ${plan.nameColor || 'text-white'}`}>{plan.name}</h3>
                                <div className="flex items-center justify-center gap-1 mb-2">
                                    <span className="text-4xl font-black italic">₹{plan.price}</span>
                                </div>
                                <span className="text-white/40 text-xs font-medium uppercase tracking-widest">/month</span>
                            </div>

                            <div className="flex-1 flex flex-col items-center justify-center text-center py-6 border-y border-white/5 my-6">
                                <span className="text-sm font-medium text-white/60">{plan.features}</span>
                            </div>

                            <button className={`w-full py-3 rounded-lg font-bold text-sm transition-all duration-200 uppercase tracking-widest ${plan.btnTheme}`}>
                                {plan.gm}
                            </button>
                        </div>
                    ))}
                </div>


            </div>
        </section>
    );
}

// --- MAIN PAGE COMPONENT ---
export default function LandingPage({ onStartOnboarding }) {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div className="min-h-screen bg-[#060D18] text-white">
            {/* --- NAVBAR --- */}
            <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#060D18]/95 backdrop-blur-xl border-b border-white/[0.06]' : 'bg-transparent'}`}>
                <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
                    <Logo />
                    <div className="flex items-center gap-2">
                        <div className="hidden lg:flex items-center gap-2">
                            <Link href="#features" className="px-4 py-2 rounded-lg text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-all duration-200">Features</Link>
                            <Link href="#how-it-works" className="px-4 py-2 rounded-lg text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-all duration-200">How it Works</Link>
                            <Link href="#pricing" className="px-4 py-2 rounded-lg text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-all duration-200">Pricing</Link>
                        </div>
                        <div className="h-4 w-[1px] bg-white/10 mx-2 hidden lg:block" />
                        <Link href="/login" className="hidden sm:block px-4 py-2 rounded-lg text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-all duration-200">Log In</Link>
                        <Link href="/login">
                            <button className="px-5 py-2.5 rounded-lg bg-[#A8E063] hover:bg-[#7EC63A] text-[#060D18] font-bold text-[11px] uppercase tracking-[0.05em] transition-all duration-200 hover:shadow-[0_0_20px_rgba(168,224,99,0.3)] active:scale-95">
                                Sign Up Free
                            </button>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* --- HERO SECTION --- */}
            <section className="relative pt-32 pb-24 overflow-hidden">
                <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-[#A8E063]/[0.04] blur-[150px] pointer-events-none" />

                <div className="section-container relative z-10 text-center">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                        <div className="inline-flex items-center gap-2 mb-8 px-4 py-1.5 rounded-full border border-[#A8E063]/30 bg-[#A8E063]/[0.06]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#A8E063] animate-pulse" />
                            <span className="text-[#A8E063] text-xs font-semibold tracking-wide uppercase">NOW LIVE — AI-powered job outreach</span>
                        </div>
                    </motion.div>

                    <motion.h1
                        className="mb-8 text-[clamp(40px,10vw,88px)] leading-[1.05] font-extrabold tracking-tight"
                        initial="hidden"
                        animate="visible"
                        variants={{
                            visible: { transition: { staggerChildren: 0.1 } }
                        }}
                    >
                        {["Land", "your", "dream", "job.", "Automatically."].map((word, i) => (
                            <motion.span
                                key={i}
                                className="inline-block mr-[0.25em]"
                                variants={{
                                    hidden: { opacity: 0, y: 30 },
                                    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
                                }}
                            >
                                {word}
                            </motion.span>
                        ))}
                    </motion.h1>

                    <motion.p
                        className="text-white/50 text-lg max-w-2xl mx-auto mb-10 leading-relaxed"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 0.6 }}
                    >
                        Paste a job URL. Our AI finds employees, writes personalized emails, and sends them from your Gmail. In 60 seconds.
                    </motion.p>

                    <div
                        className="flex flex-col sm:flex-row items-center justify-center gap-4"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7, duration: 0.6 }}
                    >
                        <Link href="/login">
                            <button className="px-8 py-4 rounded-md bg-[#A8E063] text-[#060D18] font-bold text-[15px] hover:bg-[#7EC63A] hover:shadow-[0_8px_30px_rgba(168,224,99,0.25)] transition-all duration-200 uppercase tracking-widest">
                                Start for free
                            </button>
                        </Link>
                        <Link href="/login">
                            <button className="px-8 py-4 rounded-md border border-white/20 text-white font-medium text-[15px] hover:border-white/40 hover:bg-white/[0.04] transition-all duration-200">
                                Log in to your account
                            </button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* --- TRUSTED BY --- */}
            <section className="py-12 border-y border-white/[0.06] overflow-hidden bg-[#060D18]">
                <p className="text-center text-xs font-semibold tracking-[0.12em] uppercase text-white/30 mb-8">Trusted by 500+ job seekers at</p>
                <div className="relative">
                    <div className="absolute left-0 top-0 bottom-0 w-32 z-10 bg-gradient-to-r from-[#060D18] to-transparent pointer-events-none" />
                    <div className="absolute right-0 top-0 bottom-0 w-32 z-10 bg-gradient-to-l from-[#060D18] to-transparent pointer-events-none" />
                    <div className="flex gap-16 animate-marquee whitespace-nowrap">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                            <span key={n} className="text-white/20 font-bold text-xl tracking-tighter hover:text-[#A8E063] transition-colors duration-200 cursor-default uppercase">
                                {['Google', 'Meta', 'Stripe', 'Vercel', 'Airbnb', 'Revolut', 'Coinbase', 'Figma'][n - 1]}
                            </span>
                        ))}
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                            <span key={`dup-${n}`} className="text-white/20 font-bold text-xl tracking-tighter hover:text-[#A8E063] transition-colors duration-200 cursor-default uppercase">
                                {['Google', 'Meta', 'Stripe', 'Vercel', 'Airbnb', 'Revolut', 'Coinbase', 'Figma'][n - 1]}
                            </span>
                        ))}
                    </div>
                </div>
            </section>

            {/* --- PROBLEM / SOLUTION --- */}
            <section className="bg-white py-24">
                <div className="section-container">
                    <motion.p
                        className="text-[#0B1929] text-xl font-medium text-center max-w-2xl mx-auto mb-16 leading-relaxed"
                        initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
                    >
                        Your job applications are scattered across spreadsheets, LinkedIn tabs, and copy-paste emails. You're wasting 75 minutes per application.
                        <strong className="text-[#0B1929] font-bold"> This is where Outreach.ai comes in.</strong>
                    </motion.p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {[
                            { icon: '🔗', title: 'Capture & Target', desc: 'Paste any job URL from LinkedIn or Indeed. We find 10 key employees + emails automatically.' },
                            { icon: '🤖', title: 'Structure & Write', desc: 'AI parses your resume and writes unique personalized emails for each recipient.' },
                            { icon: '🚀', title: 'Analyze & Follow Up', desc: 'Track replies, detect sentiment, and fire follow-ups automatically on Day 3 and Day 7.' },
                        ].map((item, i) => (
                            <motion.div key={i} className="text-center p-8 border border-slate-100 rounded-2xl hover:border-[#A8E063] transition-colors"
                                variants={fadeUp} custom={i} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                                <div className="w-14 h-14 rounded-2xl bg-[#A8E063]/10 flex items-center justify-center mx-auto mb-5 text-2xl">{item.icon}</div>
                                <h3 className="text-[#0B1929] font-bold text-lg mb-3">{item.title}</h3>
                                <p className="text-[#64748B] text-[15px] leading-relaxed">{item.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* --- PRODUCT DEMO --- */}
            <section className="bg-[#0B1929] py-24 overflow-hidden border-y border-white/5">
                <div className="section-container">
                    <div className="text-center mb-16">
                        <p className="label mb-4">See it in action</p>
                        <h2 className="text-white">From URL to inbox in 60 seconds</h2>
                    </div>

                    <motion.div
                        className="rounded-2xl overflow-hidden border border-white/10 shadow-[0_40px_120px_rgba(0,0,0,0.5)] max-w-4xl mx-auto"
                        initial={{ opacity: 0, y: 60 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} viewport={{ once: true }}
                    >
                        <div className="bg-[#0F2137] px-5 py-3 flex items-center gap-3 border-b border-white/[0.06]">
                            <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-[#FF5F57]" /><div className="w-3 h-3 rounded-full bg-[#FFBD2E]" /><div className="w-3 h-3 rounded-full bg-[#28CA41]" /></div>
                            <div className="flex-1 mx-4 bg-[#060D18]/60 rounded-md px-4 py-1.5 text-[10px] text-white/30 font-mono tracking-wider">app.outreach.ai/pipeline/live</div>
                        </div>
                        <div className="bg-[#060D18] p-8 md:p-12 min-h-[400px] ">
                            <PipelineDemo />
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* --- STATS ROW --- */}
            <section className="bg-[#060D18] py-20 border-b border-white/5">
                <div className="section-container">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-white/[0.08]">
                        {[
                            { number: '60', suffix: 'sec', desc: 'From job URL to 10 emails send-ready' },
                            { number: '32', suffix: '%', desc: 'Average reply rate vs 8% industry average' },
                            { number: '75', suffix: 'min', desc: 'Saved per application, for every user' },
                        ].map((stat, i) => (
                            <div key={i} className="px-12 py-10 md:py-6 text-center md:text-left">
                                <div className="flex items-end gap-1 justify-center md:justify-start mb-3">
                                    <span className="stat-number">{stat.number}</span>
                                    <span className="text-[#A8E063] font-bold text-3xl mb-2">{stat.suffix}</span>
                                </div>
                                <p className="text-white/40 text-sm leading-relaxed max-w-[200px] mx-auto md:mx-0">{stat.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* --- PRICING SECTION --- */}
            <PricingSection />

            {/* --- TAILORED SCENARIOS --- */}
            <section id="scenarios" className="bg-white py-24">
                <div className="section-container">
                    <p className="label mb-3">What you can do</p>
                    <h2 className="text-[#0B1929] mb-12">Built for every outreach scenario</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            { type: 'Referral Outreach', desc: 'Ask employees for referrals before applying. Skip the line.', bg: 'from-[#0B1929] to-[#1a2e4d]' },
                            { type: 'Direct Apply', desc: 'Email hiring managers directly. Get seen immediately.', bg: 'from-[#0d2b1e] to-[#1a4d35]' },
                            { type: 'Vacancy Inquiry', desc: 'Reach out before a role is posted. Be the first choice.', bg: 'from-[#1a1a2e] to-[#2d2b55]' },
                        ].map((card, i) => (
                            <motion.div key={i} className={`relative rounded-2xl overflow-hidden p-8 min-h-[300px] bg-gradient-to-br ${card.bg} border border-white/10 hover:border-[#A8E063]/30 transition-all group cursor-pointer`}
                                initial="hidden" whileInView="visible" variants={fadeUp} custom={i}>
                                <h3 className="text-white font-bold text-xl mb-4">{card.type}</h3>
                                <p className="text-white/60 text-[15px] leading-relaxed mb-6">{card.desc}</p>
                                <span className="text-[#A8E063] text-sm font-semibold group-hover:translate-x-1 transition-transform inline-block">Try this scenario →</span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* --- TRUST & COMPLIANCE --- */}
            <section className="bg-[#060D18] py-24 border-y border-white/5">
                <div className="section-container text-center max-w-3xl">
                    <p className="label text-white/30 mb-6">Security first</p>
                    <h2 className="text-white mb-8">Enterprise-grade security as standard</h2>
                    <p className="text-white/50 text-base mb-12 leading-relaxed">
                        We never store your Gmail password. OAuth tokens are AES-256 encrypted.
                        Emails send from your own inbox, ensuring maximum deliverability and trust.
                    </p>
                    <div className="flex flex-wrap gap-4 justify-center">
                        {['OAuth 2.0', 'AES-256 Encrypted', 'GDPR Compliant', 'Gmail Verified', 'SOC2 Ready'].map(badge => (
                            <span key={badge} className="px-5 py-2 rounded-full border border-white/10 text-white/40 text-xs font-bold uppercase tracking-widest hover:border-[#A8E063] hover:text-white transition-all cursor-default">{badge}</span>
                        ))}
                    </div>
                </div>
            </section>

            {/* --- FINAL CTA --- */}
            <section className="bg-[#0B1929] py-32 text-center">
                <div className="max-w-[600px] mx-auto px-6">
                    <p className="label mb-4">Start automating</p>
                    <h2 className="text-white mb-6">Your next job starts with one URL.</h2>
                    <p className="text-white/50 mb-10 leading-relaxed">Join 500+ job seekers who've reclaimed their time and multiplied their interview calls.</p>
                    <button onClick={onStartOnboarding} className="px-10 py-5 rounded-md bg-[#A8E063] hover:bg-[#7EC63A] text-[#060D18] font-bold text-base hover:shadow-[0_8px_40px_rgba(168,224,99,0.3)] hover:-translate-y-1 transition-all">
                        Launch Your Outreach 🚀
                    </button>
                </div>
            </section>

            {/* --- FOOTER --- */}
            <footer className="bg-[#060D18] border-t border-white/[0.06] pt-20 pb-10">
                <div className="section-container">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-12 mb-16">
                        <div className="col-span-2 md:col-span-2">
                            <Logo />
                            <p className="text-white/30 text-sm mt-6 leading-relaxed max-w-xs">
                                The most efficient way to scale your job application efforts.
                                Built for high-performers, powered by AI.
                            </p>
                        </div>
                        {[{ h: 'Product', links: ['Features', 'Pricing', 'Pipeline'] },
                        { h: 'Company', links: ['About', 'Privacy', 'Security'] },
                        { h: 'Status', links: ['99.9% Uptime', 'API Docs', 'Support'] }].map(col => (
                            <div key={col.h} className="col-span-1">
                                <p className="label text-white/20 mb-6">{col.h}</p>
                                <nav className="flex flex-col gap-4">
                                    {col.links.map(l => (
                                        <Link key={l} href="#" className="text-white/40 hover:text-white text-sm transition-colors">{l}</Link>
                                    ))}
                                </nav>
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-white/[0.06] pt-10 flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] uppercase tracking-widest text-white/20 font-bold">
                        <p>© 2025 OUTREACH.AI — ALL RIGHTS RESERVED</p>
                        <div className="flex gap-8">
                            <Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link>
                            <Link href="#" className="hover:text-white transition-colors">Terms of Service</Link>
                        </div>
                    </div>
                </div>
            </footer>

        </div>
    );
}
