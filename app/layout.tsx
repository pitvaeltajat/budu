import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Budu',
  description: 'Lippukunnan talousarvio ja sen toteuma samalla sivulla.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fi">
      <body>{children}</body>
    </html>
  );
}
