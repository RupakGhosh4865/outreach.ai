'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function AuthCallbackInner() {
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const token = searchParams.get('token');
        if (!token) {
            router.push('/login?error=auth_failed');
            return;
        }

        localStorage.setItem('authToken', token);

        try {
            // Read the email out of the JWT payload purely to prefill the UI.
            // The server never trusts this — it reads identity from the signature.
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.email) localStorage.setItem('jobreach_email', payload.email);
        } catch (err) {
            console.error('Could not read the token payload:', err);
        }

        router.push('/');
    }, [router, searchParams]);

    return <Loading />;
}

function Loading() {
    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a', color: 'white' }}>
            <div style={{ textAlign: 'center' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Authenticating...</h1>
                <div style={{ width: '50px', height: '50px', border: '5px solid #3b82f6', borderTop: '5px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                <style jsx>{`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        </div>
    );
}

/**
 * useSearchParams() opts the tree into client-side rendering, so Next requires a
 * Suspense boundary above it — without one the production build fails to
 * prerender this route.
 */
export default function AuthCallback() {
    return (
        <Suspense fallback={<Loading />}>
            <AuthCallbackInner />
        </Suspense>
    );
}
