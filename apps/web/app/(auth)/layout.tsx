'use client';

import type { ReactNode } from 'react';

import { AppProviders } from '../lib/providers';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
