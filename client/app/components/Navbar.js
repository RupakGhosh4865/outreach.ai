'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';

export default function Navbar() {
    const pathname = usePathname();
    const router = useRouter();
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('authToken');
        setIsLoggedIn(!!token);
    }, [pathname]);

    const handleLogout = () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('jobreach_email'); // Also clear email to be safe
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
        <nav className="navbar">
            <div className="navbar-inner">
                <Link href="/" className="navbar-logo">
                    <div className="logo-icon">
                        <Zap size={20} fill="currentColor" />
                    </div>
                    JobApply AI
                </Link>
                <ul className="navbar-links">
                    {links.map((l) => (
                        <li key={l.href}>
                            <Link href={l.href} className={pathname === l.href ? 'active' : ''}>
                                {l.label}
                            </Link>
                        </li>
                    ))}
                    {isLoggedIn ? (
                        <li>
                            <button onClick={handleLogout} className="logout-btn">Logout</button>
                        </li>
                    ) : (
                        <li className="auth-btns">
                            <Link href="/login" className="btn btn-primary btn-sm">Get Started</Link>
                        </li>
                    )}
                </ul>
            </div>
        </nav>
    );
}
