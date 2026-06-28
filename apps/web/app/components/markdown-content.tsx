'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="m-0 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 my-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 my-1">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold" style={{ color: 'var(--color-ink)' }}>{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children }) => (
          <code
            className="px-1 py-0.5 rounded text-xs font-mono"
            style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-ink-2)' }}
          >
            {children}
          </code>
        ),
        a: ({ href, children }) => (
          <a href={href} className="underline underline-offset-2" style={{ color: 'var(--color-accent)' }} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
