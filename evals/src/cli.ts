import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createReport, evaluateCase, reportCsv, reportHtml, reportMarkdown } from './index.js';
import type { EvaluationCaseManifest } from './types.js';

const [manifestPath, outputDirectory] = process.argv.slice(2);
if (!manifestPath || !outputDirectory) throw new Error('Usage: evals <manifest.jsonl> <output-directory>');
const cases = (await readFile(manifestPath, 'utf8'))
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as EvaluationCaseManifest);
const metrics = cases.map((testCase) =>
  evaluateCase(testCase, {
    ...(testCase.expectedTranscript ? { transcript: testCase.expectedTranscript } : {}),
    response: 'Radno vrijeme je od ponedjeljka do petka.',
    expectedIntentPreserved: true,
    providerError: false,
    estimatedCostUsd: 0,
  }),
);
const report = createReport(metrics, { runner: 'deterministic-fixture', node: process.version }, {
  wordErrorRate: { maximum: 0 },
  providerError: { maximum: 0 },
});
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2)),
  writeFile(path.join(outputDirectory, 'report.csv'), reportCsv(report)),
  writeFile(path.join(outputDirectory, 'report.md'), reportMarkdown(report)),
  writeFile(path.join(outputDirectory, 'report.html'), reportHtml(report)),
]);
if (!report.passed) process.exitCode = 1;
