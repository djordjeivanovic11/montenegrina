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
      sttProvider: 'openai',
      sttLanguage: 'sr',
      sttModel: 'gpt-4o-transcribe',
      ttsProvider: 'elevenlabs',
      fallbackAllowed: true,
      allowedProviders: ['openai', 'elevenlabs'],
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
