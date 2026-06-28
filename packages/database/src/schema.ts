import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

export const membershipRole = pgEnum('membership_role', ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER']);
export const environmentName = pgEnum('environment_name', ['development', 'staging', 'production']);
export const agentVersionStatus = pgEnum('agent_version_status', ['DRAFT', 'PUBLISHED', 'RETIRED']);
export const scriptPreference = pgEnum('script_preference', ['LATIN', 'CYRILLIC']);
export const providerKind = pgEnum('provider_kind', ['STT', 'LLM', 'TTS', 'REALTIME', 'EMBEDDING']);
export const conversationChannel = pgEnum('conversation_channel', ['TEXT', 'BROWSER', 'SIP', 'BATCH']);
export const conversationState = pgEnum('conversation_state', [
  'INITIALIZING',
  'LISTENING',
  'TRANSCRIBING',
  'THINKING',
  'TOOL_PENDING',
  'SPEAKING',
  'INTERRUPTED',
  'HANDOFF_PENDING',
  'HANDED_OFF',
  'COMPLETED',
  'FAILED',
]);
export const speaker = pgEnum('speaker', ['USER', 'ASSISTANT', 'HUMAN', 'SYSTEM']);
export const documentStatus = pgEnum('document_status', [
  'UPLOADED',
  'SCANNING',
  'PROCESSING',
  'READY',
  'FAILED',
  'QUARANTINED',
  'DELETING',
]);
export const toolRiskClass = pgEnum('tool_risk_class', [
  'READ_PUBLIC',
  'READ_CUSTOMER',
  'WRITE_REVERSIBLE',
  'WRITE_SENSITIVE',
]);
export const toolInvocationStatus = pgEnum('tool_invocation_status', [
  'PROPOSED',
  'AWAITING_CONFIRMATION',
  'RUNNING',
  'COMPLETED',
  'REJECTED',
  'FAILED',
]);
export const handoffStatus = pgEnum('handoff_status', ['REQUESTED', 'ACCEPTED', 'COMPLETED', 'FAILED']);
export const jobStatus = pgEnum('job_status', ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('organizations_slug_uq').on(table.slug)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('users_email_lower_uq').on(sql`lower(${table.email})`)],
);

export const memberships = pgTable(
  'memberships',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.userId] }), index('memberships_user_idx').on(table.userId)],
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    secretHash: text('secret_hash').notNull(),
    environment: environmentName('environment').notNull(),
    permissions: text('permissions').array().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('api_keys_prefix_uq').on(table.prefix),
    index('api_keys_org_idx').on(table.organizationId),
  ],
);

export const languageProfiles = pgTable(
  'language_profiles',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    version: integer('version').notNull(),
    script: scriptPreference('script').notNull().default('LATIN'),
    preferIjekavian: boolean('prefer_ijekavian').notNull().default(true),
    immutable: boolean('immutable').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('language_profiles_org_id_uq').on(table.organizationId, table.id),
    uniqueIndex('language_profiles_version_uq').on(table.organizationId, table.name, table.version),
  ],
);

export const promptVersions = pgTable(
  'prompt_versions',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    version: integer('version').notNull(),
    systemInstruction: text('system_instruction').notNull(),
    immutable: boolean('immutable').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('prompt_versions_org_id_uq').on(table.organizationId, table.id),
    uniqueIndex('prompt_versions_name_version_uq').on(table.organizationId, table.name, table.version),
  ],
);

export const glossaryEntries = pgTable(
  'glossary_entries',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    languageProfileId: uuid('language_profile_id').notNull(),
    term: text('term').notNull(),
    preferredForm: text('preferred_form').notNull(),
    preserveExact: boolean('preserve_exact').notNull().default(true),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.languageProfileId],
      foreignColumns: [languageProfiles.organizationId, languageProfiles.id],
      name: 'glossary_profile_tenant_fk',
    }).onDelete('cascade'),
    uniqueIndex('glossary_term_uq').on(table.languageProfileId, table.term),
  ],
);

export const pronunciationEntries = pgTable(
  'pronunciation_entries',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    languageProfileId: uuid('language_profile_id').notNull(),
    grapheme: text('grapheme').notNull(),
    phoneme: text('phoneme').notNull(),
    alphabet: text('alphabet').notNull().default('ipa'),
    providerOverrides: jsonb('provider_overrides').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.languageProfileId],
      foreignColumns: [languageProfiles.organizationId, languageProfiles.id],
      name: 'pronunciation_profile_tenant_fk',
    }).onDelete('cascade'),
    uniqueIndex('pronunciation_grapheme_uq').on(table.languageProfileId, table.grapheme),
  ],
);

export const providerConfigurations = pgTable(
  'provider_configurations',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: providerKind('kind').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    region: text('region'),
    secretRef: text('secret_ref'),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('provider_config_org_id_uq').on(table.organizationId, table.id),
    uniqueIndex('provider_config_name_uq').on(table.organizationId, table.name),
  ],
);

export const routingPolicies = pgTable(
  'routing_policies',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    environment: environmentName('environment').notNull(),
    domain: text('domain').notNull(),
    latencyClass: text('latency_class').notNull().default('interactive'),
    candidateConfigurationIds: uuid('candidate_configuration_ids').array().notNull(),
    allowedProviders: text('allowed_providers').array().notNull(),
    allowedRegions: text('allowed_regions').array().notNull(),
    allowFallback: boolean('allow_fallback').notNull().default(true),
    sttLanguage: text('stt_language'),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [uniqueIndex('routing_policy_name_uq').on(table.organizationId, table.environment, table.name)],
);

export const rateCards = pgTable(
  'rate_cards',
  {
    id: uuid('id').primaryKey(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    currency: text('currency').notNull().default('USD'),
    rates: jsonb('rates').$type<Record<string, number>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('rate_cards_version_uq').on(table.provider, table.model, table.effectiveFrom)],
);

export const deploymentEnvironments = pgTable(
  'deployment_environments',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: environmentName('name').notNull(),
    routingPolicyId: uuid('routing_policy_id').references(() => routingPolicies.id),
    maximumConcurrentSessions: integer('maximum_concurrent_sessions').notNull().default(25),
    maximumConversationMinutes: integer('maximum_conversation_minutes').notNull().default(30),
    ...timestamps,
  },
  (table) => [uniqueIndex('deployment_environment_uq').on(table.organizationId, table.name)],
);

export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    publishedVersionId: uuid('published_version_id'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('agents_org_id_uq').on(table.organizationId, table.id),
    uniqueIndex('agents_slug_uq').on(table.organizationId, table.slug),
  ],
);

export interface AgentConfigurationSnapshot {
  systemPrompt: string;
  languageProfile: {
    script: 'LATIN' | 'CYRILLIC';
    ijekavian: boolean;
    glossaryIds: string[];
    pronunciationIds: string[];
  };
  routingPolicy: {
    mode: 'real';
    pipelineMode: 'controlled' | 'direct_realtime';
    sttLanguage?: 'sr' | 'hr' | 'bs' | 'multi';
    llmModel?: string;
    ttsModel?: string;
    realtimeModel?: string;
    fallbackAllowed: boolean;
    allowedProviders: string[];
    allowedRegions: string[];
  };
  retention: { transcriptDays: number; recordAudio: boolean; audioDays: number };
  toolIds: string[];
  knowledgeSourceIds: string[];
  sensitiveWritesEnabled: boolean;
}

export const agentVersions = pgTable(
  'agent_versions',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    agentId: uuid('agent_id').notNull(),
    version: integer('version').notNull(),
    status: agentVersionStatus('status').notNull().default('DRAFT'),
    promptVersionId: uuid('prompt_version_id').notNull(),
    languageProfileId: uuid('language_profile_id').notNull(),
    routingPolicyId: uuid('routing_policy_id').notNull(),
    config: jsonb('config').$type<AgentConfigurationSnapshot>().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.agentId],
      foreignColumns: [agents.organizationId, agents.id],
      name: 'agent_version_agent_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.promptVersionId],
      foreignColumns: [promptVersions.organizationId, promptVersions.id],
      name: 'agent_version_prompt_tenant_fk',
    }),
    foreignKey({
      columns: [table.organizationId, table.languageProfileId],
      foreignColumns: [languageProfiles.organizationId, languageProfiles.id],
      name: 'agent_version_language_tenant_fk',
    }),
    uniqueIndex('agent_versions_org_id_uq').on(table.organizationId, table.id),
    uniqueIndex('agent_versions_number_uq').on(table.agentId, table.version),
  ],
);

export const knowledgeSources = pgTable(
  'knowledge_sources',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').notNull(),
    name: text('name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.agentId],
      foreignColumns: [agents.organizationId, agents.id],
      name: 'knowledge_source_agent_tenant_fk',
    }).onDelete('cascade'),
    uniqueIndex('knowledge_sources_org_id_uq').on(table.organizationId, table.id),
  ],
);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    knowledgeSourceId: uuid('knowledge_source_id').notNull(),
    title: text('title').notNull(),
    status: documentStatus('status').notNull().default('UPLOADED'),
    currentVersion: integer('current_version').notNull().default(1),
    sourceUrl: text('source_url'),
    errorCode: text('error_code'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.knowledgeSourceId],
      foreignColumns: [knowledgeSources.organizationId, knowledgeSources.id],
      name: 'document_source_tenant_fk',
    }).onDelete('cascade'),
    uniqueIndex('documents_org_id_uq').on(table.organizationId, table.id),
    index('documents_status_idx').on(table.organizationId, table.status),
  ],
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    documentId: uuid('document_id').notNull(),
    version: integer('version').notNull(),
    objectKey: text('object_key'),
    mediaType: text('media_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    extractedText: text('extracted_text'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.documentId],
      foreignColumns: [documents.organizationId, documents.id],
      name: 'document_version_document_tenant_fk',
    }).onDelete('cascade'),
    uniqueIndex('document_versions_org_id_uq').on(table.organizationId, table.id),
    uniqueIndex('document_versions_number_uq').on(table.documentId, table.version),
  ],
);

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    documentId: uuid('document_id').notNull(),
    documentVersionId: uuid('document_version_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    page: integer('page'),
    section: text('section'),
    content: text('content').notNull(),
    tokenCount: integer('token_count').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    searchText: text('search_text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.documentVersionId],
      foreignColumns: [documentVersions.organizationId, documentVersions.id],
      name: 'document_chunk_version_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.documentId],
      foreignColumns: [documents.organizationId, documents.id],
      name: 'document_chunk_document_tenant_fk',
    }).onDelete('cascade'),
    uniqueIndex('document_chunks_org_id_uq').on(table.organizationId, table.id),
    uniqueIndex('document_chunks_ordinal_uq').on(table.documentVersionId, table.ordinal),
    index('document_chunks_tenant_idx').on(table.organizationId, table.documentVersionId),
  ],
);

export const toolDefinitions = pgTable(
  'tool_definitions',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    version: integer('version').notNull(),
    description: text('description').notNull(),
    riskClass: toolRiskClass('risk_class').notNull(),
    handler: text('handler').notNull(),
    inputSchema: jsonb('input_schema').$type<Record<string, unknown>>().notNull(),
    outputSchema: jsonb('output_schema').$type<Record<string, unknown>>(),
    connectorConfig: jsonb('connector_config').$type<Record<string, unknown>>(),
    enabled: boolean('enabled').notNull().default(true),
    immutable: boolean('immutable').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('tool_definitions_org_id_uq').on(table.organizationId, table.id),
    uniqueIndex('tool_definitions_version_uq').on(table.organizationId, table.name, table.version),
  ],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    agentId: uuid('agent_id').notNull(),
    agentVersionId: uuid('agent_version_id').notNull(),
    channel: conversationChannel('channel').notNull(),
    state: conversationState('state').notNull().default('INITIALIZING'),
    language: text('language').notNull().default('cnr'),
    livekitRoomName: text('livekit_room_name'),
    externalCallId: text('external_call_id'),
    traceId: text('trace_id').notNull(),
    lastSequence: integer('last_sequence').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failureCode: text('failure_code'),
    retentionExpiresAt: timestamp('retention_expires_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.agentId],
      foreignColumns: [agents.organizationId, agents.id],
      name: 'conversation_agent_tenant_fk',
    }),
    foreignKey({
      columns: [table.organizationId, table.agentVersionId],
      foreignColumns: [agentVersions.organizationId, agentVersions.id],
      name: 'conversation_agent_version_tenant_fk',
    }),
    uniqueIndex('conversations_org_id_uq').on(table.organizationId, table.id),
    index('conversations_org_started_idx').on(table.organizationId, table.startedAt),
  ],
);

export const conversationTurns = pgTable(
  'conversation_turns',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    state: conversationState('state').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    interruptedAt: timestamp('interrupted_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.conversationId],
      foreignColumns: [conversations.organizationId, conversations.id],
      name: 'turn_conversation_tenant_fk',
    }).onDelete('cascade'),
    uniqueIndex('turns_org_id_uq').on(table.organizationId, table.id),
    uniqueIndex('turns_ordinal_uq').on(table.conversationId, table.ordinal),
  ],
);

export const transcriptSegments = pgTable(
  'transcript_segments',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    turnId: uuid('turn_id'),
    speaker: speaker('speaker').notNull(),
    originalText: text('original_text').notNull(),
    normalizedText: text('normalized_text').notNull(),
    redactedText: text('redacted_text'),
    warnings: jsonb('warnings').$type<Array<Record<string, unknown>>>().notNull().default([]),
    startedAtMs: integer('started_at_ms').notNull(),
    endedAtMs: integer('ended_at_ms'),
    final: boolean('final').notNull(),
    providerMetadata: jsonb('provider_metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.conversationId],
      foreignColumns: [conversations.organizationId, conversations.id],
      name: 'segment_conversation_tenant_fk',
    }).onDelete('cascade'),
    index('segments_conversation_idx').on(table.conversationId, table.startedAtMs),
  ],
);

export const conversationEvents = pgTable(
  'conversation_events',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    agentId: uuid('agent_id').notNull(),
    turnId: uuid('turn_id'),
    type: text('type').notNull(),
    sequence: integer('sequence').notNull(),
    traceId: text('trace_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.conversationId],
      foreignColumns: [conversations.organizationId, conversations.id],
      name: 'event_conversation_tenant_fk',
    }).onDelete('cascade'),
    uniqueIndex('events_idempotency_uq').on(table.conversationId, table.id),
    uniqueIndex('events_sequence_uq').on(table.conversationId, table.sequence),
  ],
);

export const toolInvocations = pgTable(
  'tool_invocations',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    agentId: uuid('agent_id').notNull(),
    toolDefinitionId: uuid('tool_definition_id').notNull(),
    toolVersion: integer('tool_version').notNull(),
    status: toolInvocationStatus('status').notNull(),
    validatedInput: jsonb('validated_input').$type<Record<string, unknown>>().notNull(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    errorCode: text('error_code'),
    authorizationPolicy: jsonb('authorization_policy').$type<Record<string, unknown>>().notNull(),
    idempotencyKey: text('idempotency_key'),
    confirmationText: text('confirmation_text'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    latencyMs: integer('latency_ms'),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.conversationId],
      foreignColumns: [conversations.organizationId, conversations.id],
      name: 'tool_invocation_conversation_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.toolDefinitionId],
      foreignColumns: [toolDefinitions.organizationId, toolDefinitions.id],
      name: 'tool_invocation_definition_tenant_fk',
    }),
    uniqueIndex('tool_invocation_idempotency_uq').on(table.organizationId, table.idempotencyKey),
  ],
);

export const handoffs = pgTable(
  'handoffs',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    status: handoffStatus('status').notNull(),
    reason: text('reason').notNull(),
    target: text('target'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    errorCode: text('error_code'),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.conversationId],
      foreignColumns: [conversations.organizationId, conversations.id],
      name: 'handoff_conversation_tenant_fk',
    }).onDelete('cascade'),
  ],
);

export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id'),
    conversationId: uuid('conversation_id'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    operation: text('operation').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    audioInputSeconds: real('audio_input_seconds'),
    audioOutputSeconds: real('audio_output_seconds'),
    characters: integer('characters'),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 18, scale: 8 }),
    providerRequestId: text('provider_request_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('usage_org_time_idx').on(table.organizationId, table.occurredAt)],
);

export const evaluationDatasets = pgTable(
  'evaluation_datasets',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    version: integer('version').notNull(),
    description: text('description').notNull().default(''),
    private: boolean('private').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('evaluation_datasets_org_id_uq').on(table.organizationId, table.id),
    uniqueIndex('evaluation_datasets_version_uq').on(table.organizationId, table.name, table.version),
  ],
);

export const evaluationCases = pgTable(
  'evaluation_cases',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    datasetId: uuid('dataset_id').notNull(),
    externalId: text('external_id').notNull(),
    audioObjectKey: text('audio_object_key'),
    expectedTranscript: text('expected_transcript'),
    criticalEntities: jsonb('critical_entities').$type<Array<Record<string, unknown>>>().notNull().default([]),
    expectedIntent: text('expected_intent'),
    responseConstraints: jsonb('response_constraints').$type<Record<string, unknown>>().notNull().default({}),
    languageExpectations: jsonb('language_expectations').$type<Record<string, unknown>>().notNull().default({}),
    speakerMetadata: jsonb('speaker_metadata').$type<Record<string, unknown>>().notNull().default({}),
    audioMetadata: jsonb('audio_metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.datasetId],
      foreignColumns: [evaluationDatasets.organizationId, evaluationDatasets.id],
      name: 'evaluation_case_dataset_tenant_fk',
    }).onDelete('cascade'),
    uniqueIndex('evaluation_case_external_uq').on(table.datasetId, table.externalId),
  ],
);

export const evaluationRuns = pgTable(
  'evaluation_runs',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    datasetId: uuid('dataset_id').notNull(),
    status: jobStatus('status').notNull().default('QUEUED'),
    variants: jsonb('variants').$type<Array<Record<string, unknown>>>().notNull(),
    metrics: jsonb('metrics').$type<Record<string, unknown>>(),
    reportObjectKey: text('report_object_key'),
    environment: jsonb('environment').$type<Record<string, unknown>>(),
    errorCode: text('error_code'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.datasetId],
      foreignColumns: [evaluationDatasets.organizationId, evaluationDatasets.id],
      name: 'evaluation_run_dataset_tenant_fk',
    }).onDelete('cascade'),
    index('evaluation_runs_status_idx').on(table.status, table.createdAt),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    requestId: text('request_id').notNull(),
    traceId: text('trace_id').notNull(),
    ipAddress: text('ip_address'),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('audit_org_time_idx').on(table.organizationId, table.occurredAt)],
);

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    operation: text('operation').notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: integer('status_code'),
    responseBody: jsonb('response_body').$type<Record<string, unknown>>(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.key, table.operation] })],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id'),
    type: text('type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('outbox_pending_idx').on(table.processedAt, table.availableAt)],
);

export const deletionJobs = pgTable(
  'deletion_jobs',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id'),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    status: jobStatus('status').notNull().default('QUEUED'),
    objectKeys: text('object_keys').array().notNull().default([]),
    counts: jsonb('counts').$type<Record<string, number>>(),
    errorCode: text('error_code'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('deletion_jobs_status_idx').on(table.status, table.createdAt)],
);
