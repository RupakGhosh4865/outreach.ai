'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

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
                <span className="font-inter font-bold text-[17px] tracking-[-0.02em] text-white group-hover:text-[#A8E063] transition-colors duration-200">outreach</span>
                <span className="font-inter font-bold text-[17px] tracking-[-0.02em] text-[#A8E063]">.ai</span>
            </div>
        </div>
    );
}

export default function Navbar() {
    const pathname = usePathname();
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('authToken');
        setIsLoggedIn(!!token);

        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [pathname]);

    // Don't show shared Navbar on Landing Page as it has its own integrated one
    if (pathname === '/' && !isLoggedIn) return null;

    const handleLogout = () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('jobreach_email');
        window.location.href = '/';
    };

    const links = isLoggedIn ? [
        { href: '/', label: 'Dashboard' },
        { href: '/outreach', label: 'Outreach' },
        { href: '/history', label: 'History' },
        { href: '/profile', label: 'Profile' },
    ] : [
        { href: '/', label: 'Home' },
        { href: '/pricing', label: 'Pricing' },
    ];

    return (
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 h-16 ${scrolled || pathname !== '/' ? 'bg-[#060D18]/95 backdrop-blur-xl border-b border-white/[0.06]' : 'bg-transparent'}`}>
            <div className="max-w-[1200px] mx-auto px-6 h-full flex items-center justify-between">
                <Link href="/" className="no-underline">
                    <Logo />
                </Link>

                <div className="hidden md:flex items-center gap-2">
                    {links.map((l) => (
                        <Link
                            key={l.href}
                            href={l.href}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                                pathname === l.href 
                                ? 'text-[#A8E063] bg-[#A8E063]/10' 
                                : 'text-white/50 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {l.label}
                        </Link>
                    ))}

                    <div className="h-4 w-[1px] bg-white/10 mx-2" />

                    {isLoggedIn ? (
                        <button
                            onClick={handleLogout}
                            className="bg-white/5 hover:bg-white/10 text-white text-[11px] font-bold uppercase tracking-[0.05em] px-4 py-2 rounded-lg transition-all border border-white/10 hover:border-white/20 active:scale-95"
                        >
                            Logout
                        </button>
                    ) : (
                        <Link
                            href="/login"
                            className="bg-[#A8E063] hover:bg-[#7EC63A] text-[#060D18] text-[11px] font-bold uppercase tracking-[0.05em] px-5 py-2.5 rounded-lg transition-all hover:shadow-[0_0_20px_rgba(168,224,99,0.3)] active:scale-95"
                        >
                            Get Started
                        </Link>
                    )}
                </div>
            </div>
            <style jsx>{`
                .no-underline { text-decoration: none; }
            `}</style>
        </nav>
    );
}
