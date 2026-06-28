import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './styles.css';

export const metadata: Metadata = {
  title: 'Montenegrina',
  description: 'Montenegrin conversational AI control plane',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="cnr">
      <body>{children}</body>
    </html>
  );
}
