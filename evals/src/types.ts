export interface EvaluationCaseManifest {
  id: string;
  audioFile?: string;
  audioBase64?: string;
  expectedTranscript?: string;
  criticalEntities?: Array<{ value: string; kind: 'name' | 'number' | 'date' | 'currency' | 'other' }>;
  expectedIntent?: string;
  expectedResponse?: {
    contains?: string[];
    excludes?: string[];
    protectedSpans?: string[];
    expectedCitationChunkIds?: string[];
    expectedTool?: { name: string; arguments: Record<string, unknown> };
  };
  language?: { script?: 'LATIN' | 'CYRILLIC'; requireIjekavian?: boolean; disallowEnglish?: boolean };
  speaker?: Record<string, string | number | boolean>;
  audioCondition?: Record<string, string | number | boolean>;
}

export interface EvaluationObservation {
  transcript?: string;
  response?: string;
  protectedSpans?: string[];
  citations?: string[];
  toolCall?: { name: string; arguments: Record<string, unknown> };
  expectedIntentPreserved?: boolean;
  factual?: boolean;
  timing?: {
    firstPartialMs?: number;
    finalTranscriptMs?: number;
    firstTokenMs?: number;
    firstAudioMs?: number;
    completeTurnMs?: number;
  };
  interruptionSucceeded?: boolean;
  providerError?: boolean;
  estimatedCostUsd?: number;
}

export interface CaseMetrics {
  caseId: string;
  wordErrorRate?: number;
  characterErrorRate?: number;
  criticalEntityAccuracy?: number;
  nameAccuracy?: number;
  numberAccuracy?: number;
  dateAccuracy?: number;
  currencyAccuracy?: number;
  intentPreservation?: number;
  scriptCompliance?: number;
  ijekavianCompliance?: number;
  protectedSpanPreservation?: number;
  factuality?: number;
  citationCorrectness?: number;
  toolSelectionAccuracy?: number;
  toolArgumentAccuracy?: number;
  firstPartialMs?: number;
  finalTranscriptMs?: number;
  firstTokenMs?: number;
  firstAudioMs?: number;
  completeTurnMs?: number;
  interruptionSuccess?: number;
  providerError?: number;
  estimatedCostUsd?: number;
}

