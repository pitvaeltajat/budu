import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Budu — budget tracking',
  description: 'Real-time expense tracking against a budget',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
