import type { components } from '@montenegrina/sdk-typescript';

type AgentConfiguration = components['schemas']['AgentConfiguration'];

export function buildOnboardingAgentConfig(
  systemPrompt: string,
  knowledgeBaseIds: string[] = [],
): AgentConfiguration {
  return {
    systemPrompt,
    languageProfile: {
      script: 'LATIN',
      ijekavian: true,
      glossaryIds: [],
      pronunciationIds: [],
    },
    routingPolicy: {
      mode: 'real',
      pipelineMode: 'controlled',
      sttLanguage: 'sr',
      fallbackAllowed: true,
      allowedProviders: ['deepgram', 'openai', 'elevenlabs'],
      allowedRegions: ['global'],
    },
    retention: {
      transcriptDays: 30,
      recordAudio: false,
      audioDays: 7,
    },
    toolIds: [],
    knowledgeBaseIds,
    sensitiveWritesEnabled: false,
  };
}
