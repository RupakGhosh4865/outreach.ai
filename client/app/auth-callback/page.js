'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AuthCallback() {
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const token = searchParams.get('token');
        if (token) {
            localStorage.setItem('authToken', token);

            try {
                // Decode JWT to get email (header.payload.signature)
                const payloadBase64 = token.split('.')[1];
                const decodedPayload = JSON.parse(atob(payloadBase64));
                if (decodedPayload.email) {
                    localStorage.setItem('jobreach_email', decodedPayload.email);
                }
            } catch (err) {
                console.error('Error decoding token:', err);
            }

            router.push('/');
        } else {
            // Redirect to login or error
            router.push('/login?error=auth_failed');
        }
    }, [router, searchParams]);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a', color: 'white' }}>
            <div style={{ textAlign: 'center' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Authenticating...</h1>
                <div style={{ width: '50px', height: '50px', border: '5px solid #3b82f6', borderTop: '5px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
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
