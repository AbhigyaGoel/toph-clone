import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';

import { MotionProvider } from '@/components/ui/MotionProvider';
import { ToastProvider } from '@/components/ui/ToastProvider';

import './globals.css';

export const metadata: Metadata = {
  title: 'Toph',
  description: 'Voice-logged farm work, turned into audit-ready compliance records.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.variable}>
      {/*
        The screen sizes itself to the viewport (see `DashboardScreen`), so the
        document just gets out of its way.
      */}
      <body className="font-sans antialiased">
        <MotionProvider>
          <ToastProvider>{children}</ToastProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
