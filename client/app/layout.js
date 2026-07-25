import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Navbar from './components/Navbar';
import { ToastProvider } from './components/ui/Toast';

/**
 * Fonts are self-hosted by next/font rather than pulled from a Google
 * stylesheet at runtime: no render-blocking request, no layout shift, and
 * `display: swap` keeps text visible while they load.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-jet',
  display: 'swap',
});

export const metadata = {
  title: {
    default: 'Outreach.ai — Job outreach on autopilot',
    template: '%s · Outreach.ai',
  },
  description:
    'Find the job, build a matched CV, reach the right person, and send a personalised email — automatically.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // No maximumScale / user-scalable=no — pinch-zoom must never be disabled.
  themeColor: '#070c15',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh antialiased">
        {/* Lets keyboard users jump past the nav on every page. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:font-semibold focus:text-brand-ink"
        >
          Skip to content
        </a>
        <ToastProvider>
          <Navbar />
          <main id="main">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
