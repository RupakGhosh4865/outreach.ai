'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from './ui';

/**
 * Gate for signed-in pages.
 *
 * This is a UX convenience only — it stops a signed-out visitor seeing an empty
 * shell. Real enforcement is server-side: every API route requires a valid
 * token, so bypassing this component gains nothing.
 */
export default function AuthGuard({ children }) {
    const router = useRouter();
    const [authorized, setAuthorized] = useState(false);

    useEffect(() => {
        if (localStorage.getItem('authToken')) setAuthorized(true);
        else router.push('/login');
    }, [router]);

    if (!authorized) {
        return (
            <div className="flex min-h-dvh items-center justify-center" role="status">
                <Spinner className="size-8" label="Checking your session" />
            </div>
        );
    }

    return children;
}
