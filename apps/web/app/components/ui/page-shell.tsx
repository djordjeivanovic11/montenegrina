'use client';

import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string | undefined;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return <div className={`card ${className}`}>{children}</div>;
}

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'muted';
}

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {description && <p className="text-sm text-ink-2 mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
