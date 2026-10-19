import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AuthProvider } from '@/features/auth/AuthContext';
import { ThemeProvider } from '@/features/theme/ThemeContext';
import { ToastProvider } from '@/features/toast/ToastContext';
import { ToastViewport } from '@/features/toast/ToastViewport';
import { StoreProvider } from '@/store/StoreProvider';
import './globals.css';

export const metadata: Metadata = { title: 'Northwind Shop', description: 'Everyday goods, delivered.' };

const FOOTER_LINKS = [
  { href: '/blog/privacy', label: 'Privacy' },
  { href: '/blog/terms', label: 'Terms' },
];

/** App shell: Redux store, auth, theme and toasts wrap every page. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <AuthProvider>
            <ThemeProvider>
              <ToastProvider>
                <Header />
                <main className="container mx-auto px-4">{children}</main>
                <Footer links={FOOTER_LINKS} year={new Date().getFullYear()} />
                <ToastViewport />
              </ToastProvider>
            </ThemeProvider>
          </AuthProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
