'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
    LayoutDashboard, Send, History, User, Menu, X, LogOut, Sparkles,
} from 'lucide-react';
import { cn } from './ui';
import { clearSession } from '@/lib/api';

function Logo() {
    return (
        <span className="flex items-center gap-2.5">
            <span className="relative grid size-8 place-items-center">
                <span className="absolute inset-0 rotate-[8deg] rounded-lg bg-brand/20" aria-hidden="true" />
                <span className="relative grid size-7 rotate-[8deg] place-items-center rounded-[7px] bg-linear-to-br from-brand to-[#7ec63a] shadow-[0_0_16px_rgba(168,224,99,0.35)]">
                    <span className="-rotate-[8deg] text-sm font-black leading-none text-brand-ink">O</span>
                </span>
            </span>
            <span className="text-[17px] font-bold tracking-[-0.02em]">
                outreach<span className="text-brand">.ai</span>
            </span>
        </span>
    );
}

const AUTHED_LINKS = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/outreach', label: 'Outreach', icon: Send },
    { href: '/history', label: 'History', icon: History },
    { href: '/profile', label: 'Profile', icon: User },
];

const PUBLIC_LINKS = [
    { href: '/', label: 'Home', icon: Sparkles },
    { href: '/pricing', label: 'Pricing', icon: Sparkles },
];

export default function Navbar() {
    const pathname = usePathname();
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        setIsLoggedIn(Boolean(localStorage.getItem('authToken')));
        setMenuOpen(false); // close the drawer on navigation
    }, [pathname]);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 12);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Lock body scroll behind the mobile drawer, and allow Escape to close it.
    useEffect(() => {
        if (!menuOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener('keydown', onKey);
        };
    }, [menuOpen]);

    // The landing page ships its own integrated nav.
    if (pathname === '/' && !isLoggedIn) return null;

    const links = isLoggedIn ? AUTHED_LINKS : PUBLIC_LINKS;

    const handleLogout = () => {
        clearSession();
        window.location.href = '/';
    };

    return (
        <>
            <header
                className={cn(
                    'fixed inset-x-0 top-0 h-16 transition-colors duration-300',
                    scrolled || pathname !== '/'
                        ? 'border-b border-white/6 bg-bg/90 backdrop-blur-xl'
                        : 'bg-transparent',
                )}
                style={{ zIndex: 'var(--z-nav)' }}
            >
                <nav className="shell flex h-full items-center justify-between" aria-label="Main">
                    <Link href="/" className="tap rounded-lg" aria-label="Outreach.ai home">
                        <Logo />
                    </Link>

                    {/* Desktop */}
                    <div className="hidden items-center gap-1 md:flex">
                        {links.map((l) => {
                            const active = pathname === l.href;
                            return (
                                <Link
                                    key={l.href}
                                    href={l.href}
                                    aria-current={active ? 'page' : undefined}
                                    className={cn(
                                        'tap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-200',
                                        active
                                            ? 'bg-brand/10 text-brand'
                                            : 'text-muted hover:bg-white/5 hover:text-text',
                                    )}
                                >
                                    {l.label}
                                </Link>
                            );
                        })}

                        <span className="mx-2 h-4 w-px bg-white/10" aria-hidden="true" />

                        {isLoggedIn ? (
                            <button type="button" onClick={handleLogout} className="ui-btn ui-btn-secondary ui-btn-sm">
                                <LogOut className="size-3.5" aria-hidden="true" />
                                Log out
                            </button>
                        ) : (
                            <Link href="/login" className="ui-btn ui-btn-primary ui-btn-sm">
                                Get started
                            </Link>
                        )}
                    </div>

                    {/* Mobile trigger — the old navbar simply hid the links below md,
                        leaving no way to navigate on a phone. */}
                    <button
                        type="button"
                        onClick={() => setMenuOpen((o) => !o)}
                        aria-expanded={menuOpen}
                        aria-controls="mobile-nav"
                        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                        className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm md:hidden"
                    >
                        {menuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
                    </button>
                </nav>
            </header>

            {/* Mobile drawer */}
            {menuOpen && (
                <div className="md:hidden" style={{ zIndex: 'var(--z-overlay)' }}>
                    <button
                        type="button"
                        aria-label="Close menu"
                        onClick={() => setMenuOpen(false)}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                        style={{ zIndex: 'var(--z-overlay)' }}
                    />
                    <div
                        id="mobile-nav"
                        className="animate-fade-up fixed inset-x-0 top-16 mx-3 rounded-2xl border border-white/10 bg-surface p-3 shadow-lg"
                        style={{ zIndex: 'var(--z-modal)' }}
                    >
                        <ul className="space-y-1">
                            {links.map((l) => {
                                const active = pathname === l.href;
                                const Icon = l.icon;
                                return (
                                    <li key={l.href}>
                                        <Link
                                            href={l.href}
                                            aria-current={active ? 'page' : undefined}
                                            className={cn(
                                                // 48px rows — comfortable touch targets.
                                                'tap flex min-h-12 items-center gap-3 rounded-xl px-3 text-[0.95rem] font-medium transition-colors',
                                                active ? 'bg-brand/10 text-brand' : 'text-muted hover:bg-white/5 hover:text-text',
                                            )}
                                        >
                                            <Icon className="size-4.5 shrink-0" aria-hidden="true" />
                                            {l.label}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>

                        <div className="mt-3 border-t border-white/10 pt-3">
                            {isLoggedIn ? (
                                /* Sign-out sits apart from navigation — it isn't a destination. */
                                <button type="button" onClick={handleLogout} className="ui-btn ui-btn-secondary ui-btn-block">
                                    <LogOut className="size-4" aria-hidden="true" />
                                    Log out
                                </button>
                            ) : (
                                <Link href="/login" className="ui-btn ui-btn-primary ui-btn-block">
                                    Get started
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
