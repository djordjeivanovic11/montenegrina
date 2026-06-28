import type { CaseMetrics } from './types.js';
import { aggregateMetrics } from './metrics.js';

export interface EvaluationReport {
  generatedAt: string;
  environment: Record<string, string | number | boolean>;
  cases: CaseMetrics[];
  aggregate: Record<string, number>;
  passed: boolean;
  thresholds: Record<string, { maximum?: number; minimum?: number }>;
}

export function createReport(
  cases: CaseMetrics[],
  environment: EvaluationReport['environment'],
  thresholds: EvaluationReport['thresholds'] = {},
): EvaluationReport {
  const aggregate = aggregateMetrics(cases);
  const passed = Object.entries(thresholds).every(([metric, threshold]) => {
    const value = aggregate[metric];
    if (value === undefined) return false;
    return (threshold.minimum === undefined || value >= threshold.minimum) &&
      (threshold.maximum === undefined || value <= threshold.maximum);
  });
  return { generatedAt: new Date().toISOString(), environment, cases, aggregate, passed, thresholds };
}

export function reportCsv(report: EvaluationReport): string {
  const metrics = [...new Set(report.cases.flatMap((item) => Object.keys(item)))];
  return [
    metrics.join(','),
    ...report.cases.map((item) => metrics.map((metric) => JSON.stringify(item[metric as keyof CaseMetrics] ?? '')).join(',')),
  ].join('\n');
}

export function reportMarkdown(report: EvaluationReport): string {
  const rows = Object.entries(report.aggregate)
    .map(([metric, value]) => `| ${metric} | ${value.toFixed(4)} |`)
    .join('\n');
  return `# Evaluation report\n\nGenerated: ${report.generatedAt}\n\nResult: **${report.passed ? 'PASS' : 'FAIL'}**\n\n| Metric | Mean |\n| --- | ---: |\n${rows}\n`;
}

export function reportHtml(report: EvaluationReport): string {
  const rows = Object.entries(report.aggregate)
    .map(([metric, value]) => `<tr><td>${metric}</td><td>${value.toFixed(4)}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Montenegrina evaluation</title><style>body{font:16px system-ui;max-width:900px;margin:3rem auto}table{border-collapse:collapse}td,th{padding:.5rem;border:1px solid #ccc}</style><body><h1>Evaluation report</h1><p>${report.passed ? 'PASS' : 'FAIL'} — ${report.generatedAt}</p><table><thead><tr><th>Metric</th><th>Mean</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

