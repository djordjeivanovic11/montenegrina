import { loadEnvironment } from '@montenegrina/config';
import { defaultMontenegrinSystemInstruction } from '@montenegrina/language-cnr';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { createDatabase } from './client.js';
import {
  accessGroupMemberships,
  accessGroups,
  agentKnowledgeBaseAssignments,
  agentVersions,
  agents,
  deploymentEnvironments,
  evaluationCases,
  evaluationDatasets,
  knowledgeBases,
  languageProfiles,
  memberships,
  organizationOnboarding,
  organizations,
  planEntitlements,
  plans,
  promptVersions,
  providerConfigurations,
  routingPolicies,
  toolDefinitions,
  users,
} from './schema.js';

const environment = loadEnvironment();
const { db, pool } = createDatabase(environment.DATABASE_URL);
const organizationSlug = environment.NODE_ENV === 'production' ? 'default' : 'local-demo';

try {
  const existing = await db.query.organizations.findFirst({
    where: eq(organizations.slug, organizationSlug),
  });
  if (existing) {
    process.stdout.write('Default organization bootstrap already exists.\n');
  } else {
    await db.transaction(async (transaction) => {
      const organizationId = uuidv7();
      const userId = uuidv7();
      const languageProfileId = uuidv7();
      const promptVersionId = uuidv7();
      const routingPolicyId = uuidv7();
      const agentId = uuidv7();
      const agentVersionId = uuidv7();
      const knowledgeBaseId = uuidv7();
      const accessGroupId = uuidv7();
      const datasetId = uuidv7();
      const providerIds = {
        stt: uuidv7(),
        llm: uuidv7(),
        tts: uuidv7(),
        realtime: uuidv7(),
        embedding: uuidv7(),
      };

      await transaction.insert(organizations).values({
        id: organizationId,
        name: environment.NODE_ENV === 'production' ? 'Montenegrina' : 'Montenegrina Local Demo',
        slug: organizationSlug,
      });
      await transaction.insert(users).values({
        id: userId,
        email: environment.LOCAL_ADMIN_EMAIL.toLocaleLowerCase('en'),
        displayName: 'Local Administrator',
        passwordHash: await argon2.hash(environment.LOCAL_ADMIN_PASSWORD, { type: argon2.argon2id }),
      });
      await transaction.insert(memberships).values({ organizationId, userId, role: 'OWNER' });
      await transaction.insert(languageProfiles).values({
        id: languageProfileId,
        organizationId,
        name: 'Default Montenegrin',
        version: 1,
        script: 'LATIN',
        preferIjekavian: true,
        immutable: true,
      });
      await transaction.insert(promptVersions).values({
        id: promptVersionId,
        organizationId,
        name: 'Default spoken assistant',
        version: 1,
        systemInstruction: defaultMontenegrinSystemInstruction,
        immutable: true,
      });
      await transaction.insert(providerConfigurations).values([
        {
          id: providerIds.stt,
          organizationId,
          name: 'Deepgram Nova-3',
          kind: 'STT',
          provider: 'deepgram',
          model: environment.DEEPGRAM_MODEL,
          secretRef: 'env://DEEPGRAM_API_KEY',
          settings: { providerLanguage: 'sr', benchmarkCandidates: ['sr', 'hr', 'bs', 'multi'] },
        },
        {
          id: providerIds.llm,
          organizationId,
          name: 'OpenAI Responses',
          kind: 'LLM',
          provider: 'openai',
          model: environment.OPENAI_MODEL,
          secretRef: 'env://OPENAI_API_KEY',
          settings: { reasoningEffort: 'none' },
        },
        {
          id: providerIds.tts,
          organizationId,
          name: 'ElevenLabs streaming TTS',
          kind: 'TTS',
          provider: 'elevenlabs',
          model: environment.ELEVENLABS_MODEL,
          secretRef: 'env://ELEVENLABS_API_KEY',
          settings: { voiceRef: 'env://ELEVENLABS_MONTENEGRIN_VOICE_ID', outputFormat: 'pcm_24000' },
        },
        {
          id: providerIds.realtime,
          organizationId,
          name: 'OpenAI direct realtime comparison',
          kind: 'REALTIME',
          provider: 'openai',
          model: environment.OPENAI_REALTIME_MODEL,
          secretRef: 'env://OPENAI_API_KEY',
          settings: { comparisonOnly: true },
        },
        {
          id: providerIds.embedding,
          organizationId,
          name: 'OpenAI embeddings',
          kind: 'EMBEDDING',
          provider: 'openai',
          model: environment.OPENAI_EMBEDDING_MODEL,
          secretRef: 'env://OPENAI_API_KEY',
          settings: { dimensions: environment.OPENAI_EMBEDDING_DIMENSIONS },
        },
      ]);
      await transaction.insert(routingPolicies).values({
        id: routingPolicyId,
        organizationId,
        name: 'Local controlled pipeline',
        environment: 'development',
        domain: 'BROWSER',
        candidateConfigurationIds: Object.values(providerIds),
        allowedProviders: ['deepgram', 'openai', 'elevenlabs'],
        allowedRegions: ['global'],
        allowFallback: true,
        sttLanguage: 'sr',
        settings: { pipelineMode: 'controlled' },
      });
      await transaction.insert(deploymentEnvironments).values({
        id: uuidv7(),
        organizationId,
        name: 'development',
        routingPolicyId,
        maximumConcurrentSessions: environment.MAX_CONCURRENT_SESSIONS,
        maximumConversationMinutes: environment.MAX_CONVERSATION_MINUTES,
      });
      await transaction.insert(agents).values({
        id: agentId,
        organizationId,
        name: 'Lokalni asistent',
        slug: 'lokalni-asistent',
        description: 'Produkcijski Montenegrin controlled-pipeline agent.',
      });
      await transaction.insert(knowledgeBases).values({
        id: knowledgeBaseId,
        organizationId,
        name: 'Lokalna dokumentacija',
        slug: 'lokalna-dokumentacija',
        description: 'Primjer baze znanja za lokalni razvoj.',
        defaultLanguage: 'cnr',
      });
      await transaction.insert(agentKnowledgeBaseAssignments).values({
        organizationId,
        agentId,
        knowledgeBaseId,
      });
      await transaction.insert(accessGroups).values({
        id: accessGroupId,
        organizationId,
        name: 'Administracija',
        slug: 'administracija',
        description: 'Pristup ograničenim dokumentima.',
      });
      await transaction.insert(accessGroupMemberships).values({
        organizationId,
        accessGroupId,
        userId,
      });

      const toolRows = [
        ['product_lookup', 'Lookup public product information', 'READ_PUBLIC', 'sandbox.product_lookup'],
        ['appointment_availability', 'Check appointment availability', 'READ_PUBLIC', 'sandbox.appointment_availability'],
        ['appointment_create', 'Create a reversible appointment', 'WRITE_REVERSIBLE', 'sandbox.appointment_create'],
        ['request_status', 'Look up a customer request', 'READ_CUSTOMER', 'sandbox.request_status'],
        ['human_handoff', 'Request human handoff', 'READ_CUSTOMER', 'sandbox.handoff'],
      ] as const;
      const toolIds = toolRows.map(() => uuidv7());
      await transaction.insert(toolDefinitions).values(
        toolRows.map(([name, description, riskClass, handler], index) => ({
          id: toolIds[index] as string,
          organizationId,
          name,
          version: 1,
          description,
          riskClass,
          handler,
          inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {},
          },
          outputSchema: { type: 'object' },
          immutable: true,
        })),
      );
      await transaction.insert(agentVersions).values({
        id: agentVersionId,
        organizationId,
        agentId,
        version: 1,
        status: 'PUBLISHED',
        promptVersionId,
        languageProfileId,
        routingPolicyId,
        createdBy: userId,
        publishedAt: new Date(),
        config: {
          systemPrompt: defaultMontenegrinSystemInstruction,
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
            transcriptDays: environment.TRANSCRIPT_RETENTION_DAYS,
            recordAudio: false,
            audioDays: environment.AUDIO_RETENTION_DAYS,
          },
          toolIds,
          knowledgeBaseIds: [knowledgeBaseId],
          sensitiveWritesEnabled: false,
        },
      });
      await transaction
        .update(agents)
        .set({ publishedVersionId: agentVersionId, updatedAt: new Date() })
        .where(eq(agents.id, agentId));
      await transaction.insert(evaluationDatasets).values({
        id: datasetId,
        organizationId,
        name: 'Public synthetic Montenegrin fixtures',
        version: 1,
        description: 'Distributable synthetic fixtures; no real-person recordings.',
        private: false,
      });
      await transaction.insert(evaluationCases).values({
        id: uuidv7(),
        organizationId,
        datasetId,
        externalId: 'text-working-hours',
        expectedTranscript: 'Koje je vaše radno vrijeme?',
        criticalEntities: [],
        expectedIntent: 'working_hours',
        responseConstraints: { contains: ['ponedjeljka', 'petka'] },
        languageExpectations: { script: 'LATIN', ijekavian: true },
        speakerMetadata: { synthetic: true },
        audioMetadata: { condition: 'clean', synthetic: true },
      });
    });
    process.stdout.write('Default organization bootstrap completed.\n');
  }

  const planDefinitions = [
    {
      slug: 'free',
      name: 'Free',
      description: 'Test Montenegrina with strict limits.',
      sortOrder: 0,
      entitlements: [
        { metric: 'AGENTS' as const, limitValue: 1 },
        { metric: 'VOICE_MINUTES' as const, limitValue: 30 },
        { metric: 'TEXT_MESSAGES' as const, limitValue: 200 },
        { metric: 'DOCUMENTS' as const, limitValue: 20 },
        { metric: 'TEAM_MEMBERS' as const, limitValue: 1 },
        { metric: 'RETRIEVAL_QUERIES' as const, limitValue: 500 },
      ],
    },
    {
      slug: 'pro',
      name: 'Pro',
      description: 'For growing teams deploying production agents.',
      sortOrder: 1,
      entitlements: [
        { metric: 'AGENTS' as const, limitValue: 5 },
        { metric: 'VOICE_MINUTES' as const, limitValue: 500 },
        { metric: 'TEXT_MESSAGES' as const, limitValue: 5000 },
        { metric: 'DOCUMENTS' as const, limitValue: 100 },
        { metric: 'TEAM_MEMBERS' as const, limitValue: 5 },
        { metric: 'RETRIEVAL_QUERIES' as const, limitValue: 10_000 },
      ],
    },
    {
      slug: 'business',
      name: 'Business',
      description: 'Higher limits for institutions and contact centers.',
      sortOrder: 2,
      entitlements: [
        { metric: 'AGENTS' as const, limitValue: 25 },
        { metric: 'VOICE_MINUTES' as const, limitValue: 5000 },
        { metric: 'TEXT_MESSAGES' as const, limitValue: 50_000 },
        { metric: 'DOCUMENTS' as const, limitValue: 1000 },
        { metric: 'TEAM_MEMBERS' as const, limitValue: 25 },
        { metric: 'RETRIEVAL_QUERIES' as const, limitValue: 100_000 },
      ],
    },
    {
      slug: 'enterprise',
      name: 'Enterprise',
      description: 'Custom limits, SLAs, and dedicated support.',
      sortOrder: 3,
      entitlements: [
        { metric: 'AGENTS' as const, limitValue: 999_999 },
        { metric: 'VOICE_MINUTES' as const, limitValue: 999_999 },
        { metric: 'TEXT_MESSAGES' as const, limitValue: 999_999 },
        { metric: 'DOCUMENTS' as const, limitValue: 999_999 },
        { metric: 'TEAM_MEMBERS' as const, limitValue: 999_999 },
        { metric: 'RETRIEVAL_QUERIES' as const, limitValue: 999_999 },
      ],
    },
  ];

  for (const planDef of planDefinitions) {
    const existingPlan = await db.query.plans.findFirst({ where: eq(plans.slug, planDef.slug) });
    if (existingPlan) continue;
    const planId = uuidv7();
    await db.insert(plans).values({
      id: planId,
      slug: planDef.slug,
      name: planDef.name,
      description: planDef.description,
      sortOrder: planDef.sortOrder,
    });
    for (const entitlement of planDef.entitlements) {
      await db.insert(planEntitlements).values({
        id: uuidv7(),
        planId,
        metric: entitlement.metric,
        limitValue: entitlement.limitValue,
      });
    }
    process.stdout.write(`Seeded plan ${planDef.slug}.\n`);
  }
} finally {
  await pool.end();
}
