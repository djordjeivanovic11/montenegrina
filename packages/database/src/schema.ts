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
export const documentVisibility = pgEnum('document_visibility', [
  'ORG',
  'ROLE_RESTRICTED',
  'GROUP_RESTRICTED',
]);
export const ingestionStage = pgEnum('ingestion_stage', [
  'QUEUED',
  'DOWNLOADING',
  'PARSING',
  'CHUNKING',
  'EMBEDDING',
  'INDEXING',
  'COMPLETED',
  'FAILED',
]);
export const restrictedRole = pgEnum('restricted_role', ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER']);
export const organizationUseCase = pgEnum('organization_use_case', [
  'CUSTOMER_SUPPORT',
  'GOVERNMENT',
  'MUNICIPALITY',
  'BANKING',
  'TELECOM',
  'TOURISM',
  'HEALTHCARE',
  'GENERAL',
]);
export const onboardingStep = pgEnum('onboarding_step', [
  'NAME_WORKSPACE',
  'CHOOSE_USE_CASE',
  'CREATE_AGENT',
  'CONFIGURE_AGENT',
  'ADD_KNOWLEDGE',
  'TEST_AGENT',
  'PUBLISH_AGENT',
  'COMPLETED',
]);
export const invitationStatus = pgEnum('invitation_status', ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']);
export const subscriptionStatus = pgEnum('subscription_status', ['ACTIVE', 'CANCELED', 'PAST_DUE', 'TRIALING']);
export const channelType = pgEnum('channel_type', ['BROWSER', 'SIP', 'TWILIO', 'TELNYX', 'TELECOM']);
export const channelStatus = pgEnum('channel_status', ['ACTIVE', 'INACTIVE', 'COMING_SOON']);
export const planMetric = pgEnum('plan_metric', [
  'AGENTS',
  'VOICE_MINUTES',
  'TEXT_MESSAGES',
  'LLM_TOKENS',
  'STORAGE_BYTES',
  'DOCUMENTS',
  'RETRIEVAL_QUERIES',
  'TEAM_MEMBERS',
]);

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
    useCase: organizationUseCase('use_case').default('GENERAL'),
    deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('organizations_slug_uq').on(table.slug)],
);

export const organizationOnboarding = pgTable(
  'organization_onboarding',
  {
    organizationId: uuid('organization_id')
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    currentStep: onboardingStep('current_step').notNull().default('NAME_WORKSPACE'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
);

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    isPublic: boolean('is_public').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex('plans_slug_uq').on(table.slug)],
);

export const planEntitlements = pgTable(
  'plan_entitlements',
  {
    id: uuid('id').primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    metric: planMetric('metric').notNull(),
    limitValue: bigint('limit_value', { mode: 'number' }).notNull(),
    period: text('period').notNull().default('monthly'),
  },
  (table) => [uniqueIndex('plan_entitlements_plan_metric_uq').on(table.planId, table.metric)],
);

export const organizationSubscriptions = pgTable(
  'organization_subscriptions',
  {
    organizationId: uuid('organization_id')
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatus('status').notNull().default('ACTIVE'),
    externalCustomerId: text('external_customer_id'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull().defaultNow(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    ...timestamps,
  },
);

export const communicationChannels = pgTable(
  'communication_channels',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: channelType('type').notNull(),
    name: text('name').notNull(),
    status: channelStatus('status').notNull().default('INACTIVE'),
    configuration: jsonb('configuration').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('communication_channels_org_type_uq').on(table.organizationId, table.type),
    index('communication_channels_org_idx').on(table.organizationId),
  ],
);

export const phoneNumbers = pgTable(
  'phone_numbers',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').references(() => communicationChannels.id, { onDelete: 'set null' }),
    e164: text('e164').notNull(),
    label: text('label').notNull().default(''),
    inboundAgentId: uuid('inbound_agent_id'),
    enabled: boolean('enabled').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('phone_numbers_org_e164_uq').on(table.organizationId, table.e164),
    index('phone_numbers_org_idx').on(table.organizationId),
  ],
);

export const providerCredentials = pgTable(
  'provider_credentials',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    label: text('label').notNull(),
    secretRef: text('secret_ref').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps,
  },
  (table) => [index('provider_credentials_org_idx').on(table.organizationId)],
);

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    events: text('events').array().notNull(),
    secretHash: text('secret_hash').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    lastDeliveryAt: timestamp('last_delivery_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('webhook_endpoints_org_idx').on(table.organizationId)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash'),
    googleId: text('google_id'),
    avatarUrl: text('avatar_url'),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('users_email_lower_uq').on(sql`lower(${table.email})`),
    uniqueIndex('users_google_id_uq').on(table.googleId),
  ],
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

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: membershipRole('role').notNull().default('DEVELOPER'),
    tokenHash: text('token_hash').notNull(),
    status: invitationStatus('status').notNull().default('PENDING'),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('invitations_org_idx').on(table.organizationId),
    index('invitations_email_idx').on(sql`lower(${table.email})`),
  ],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('password_reset_tokens_user_idx').on(table.userId)],
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
    archivedAt: timestamp('archived_at', { withTimezone: true }),
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
  /** @deprecated use knowledgeBaseIds */
  knowledgeSourceIds?: string[];
  knowledgeBaseIds: string[];
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

export const knowledgeBases = pgTable(
  'knowledge_bases',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    defaultLanguage: text('default_language').notNull().default('cnr'),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('knowledge_bases_org_id_uq').on(table.organizationId, table.id),
    uniqueIndex('knowledge_bases_slug_uq').on(table.organizationId, table.slug),
  ],
);

export const agentKnowledgeBaseAssignments = pgTable(
  'agent_knowledge_base_assignments',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').notNull(),
    knowledgeBaseId: uuid('knowledge_base_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.agentId],
      foreignColumns: [agents.organizationId, agents.id],
      name: 'agent_kb_assignment_agent_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.knowledgeBaseId],
      foreignColumns: [knowledgeBases.organizationId, knowledgeBases.id],
      name: 'agent_kb_assignment_kb_tenant_fk',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.organizationId, table.agentId, table.knowledgeBaseId] }),
    index('agent_kb_assignment_agent_idx').on(table.organizationId, table.agentId),
  ],
);

export const accessGroups = pgTable(
  'access_groups',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('access_groups_org_id_uq').on(table.organizationId, table.id),
    uniqueIndex('access_groups_slug_uq').on(table.organizationId, table.slug),
  ],
);

export const accessGroupMemberships = pgTable(
  'access_group_memberships',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    accessGroupId: uuid('access_group_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.accessGroupId],
      foreignColumns: [accessGroups.organizationId, accessGroups.id],
      name: 'access_group_membership_group_tenant_fk',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.organizationId, table.accessGroupId, table.userId] }),
    index('access_group_memberships_user_idx').on(table.organizationId, table.userId),
  ],
);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    knowledgeBaseId: uuid('knowledge_base_id').notNull(),
    title: text('title').notNull(),
    documentType: text('document_type').notNull().default('general'),
    language: text('language').notNull().default('cnr'),
    ministryDepartment: text('ministry_department'),
    publicationDate: timestamp('publication_date', { withTimezone: true }),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    visibility: documentVisibility('visibility').notNull().default('ORG'),
    minimumRole: restrictedRole('minimum_role'),
    status: documentStatus('status').notNull().default('UPLOADED'),
    currentVersion: integer('current_version').notNull().default(1),
    sourceUrl: text('source_url'),
    sha256: text('sha256'),
    errorCode: text('error_code'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.knowledgeBaseId],
      foreignColumns: [knowledgeBases.organizationId, knowledgeBases.id],
      name: 'document_kb_tenant_fk',
    }).onDelete('cascade'),
    uniqueIndex('documents_org_id_uq').on(table.organizationId, table.id),
    index('documents_status_idx').on(table.organizationId, table.status),
    index('documents_kb_status_idx').on(table.organizationId, table.knowledgeBaseId, table.status),
    uniqueIndex('documents_kb_sha256_uq')
      .on(table.organizationId, table.knowledgeBaseId, table.sha256)
      .where(sql`${table.deletedAt} IS NULL AND ${table.sha256} IS NOT NULL`),
  ],
);

export const documentAccessGroups = pgTable(
  'document_access_groups',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id').notNull(),
    accessGroupId: uuid('access_group_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.documentId],
      foreignColumns: [documents.organizationId, documents.id],
      name: 'document_access_group_document_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.accessGroupId],
      foreignColumns: [accessGroups.organizationId, accessGroups.id],
      name: 'document_access_group_group_tenant_fk',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.organizationId, table.documentId, table.accessGroupId] }),
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
    sourceUrl: text('source_url'),
    pageCount: integer('page_count'),
    parserVersion: text('parser_version'),
    structureJson: jsonb('structure_json').$type<Record<string, unknown>>(),
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

export const documentSections = pgTable(
  'document_sections',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    documentId: uuid('document_id').notNull(),
    documentVersionId: uuid('document_version_id').notNull(),
    parentSectionId: uuid('parent_section_id'),
    ordinal: integer('ordinal').notNull(),
    heading: text('heading'),
    level: integer('level').notNull().default(0),
    pageStart: integer('page_start'),
    pageEnd: integer('page_end'),
    articleNumber: text('article_number'),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.documentVersionId],
      foreignColumns: [documentVersions.organizationId, documentVersions.id],
      name: 'document_section_version_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.documentId],
      foreignColumns: [documents.organizationId, documents.id],
      name: 'document_section_document_tenant_fk',
    }).onDelete('cascade'),
    uniqueIndex('document_sections_org_id_uq').on(table.organizationId, table.id),
    uniqueIndex('document_sections_ordinal_uq').on(table.documentVersionId, table.ordinal),
    index('document_sections_version_idx').on(table.organizationId, table.documentVersionId),
  ],
);

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    documentId: uuid('document_id').notNull(),
    documentVersionId: uuid('document_version_id').notNull(),
    sectionId: uuid('section_id'),
    ordinal: integer('ordinal').notNull(),
    page: integer('page'),
    section: text('section'),
    articleNumber: text('article_number'),
    headingPath: text('heading_path'),
    content: text('content').notNull(),
    tokenCount: integer('token_count').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    searchText: text('search_text').notNull(),
    vectorScore: real('vector_score'),
    lexicalScore: real('lexical_score'),
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
    foreignKey({
      columns: [table.organizationId, table.sectionId],
      foreignColumns: [documentSections.organizationId, documentSections.id],
      name: 'document_chunk_section_tenant_fk',
    }).onDelete('set null'),
    uniqueIndex('document_chunks_org_id_uq').on(table.organizationId, table.id),
    uniqueIndex('document_chunks_ordinal_uq').on(table.documentVersionId, table.ordinal),
    index('document_chunks_tenant_idx').on(table.organizationId, table.documentVersionId),
  ],
);

export const ingestionJobs = pgTable(
  'ingestion_jobs',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id').notNull(),
    documentVersionId: uuid('document_version_id').notNull(),
    status: jobStatus('status').notNull().default('QUEUED'),
    stage: ingestionStage('stage').notNull().default('QUEUED'),
    progressPercent: integer('progress_percent').notNull().default(0),
    errorCode: text('error_code'),
    errorDetails: text('error_details'),
    attempts: integer('attempts').notNull().default(0),
    workerId: text('worker_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.documentId],
      foreignColumns: [documents.organizationId, documents.id],
      name: 'ingestion_job_document_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId, table.documentVersionId],
      foreignColumns: [documentVersions.organizationId, documentVersions.id],
      name: 'ingestion_job_version_tenant_fk',
    }).onDelete('cascade'),
    index('ingestion_jobs_version_idx').on(table.documentVersionId),
    index('ingestion_jobs_status_idx').on(table.organizationId, table.status, table.createdAt),
  ],
);

export const retrievalEvents = pgTable(
  'retrieval_events',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id'),
    conversationId: uuid('conversation_id'),
    query: text('query').notNull(),
    knowledgeBaseIds: uuid('knowledge_base_ids').array().notNull().default([]),
    resultCount: integer('result_count').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    chunkIds: uuid('chunk_ids').array().notNull().default([]),
    scores: jsonb('scores').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('retrieval_events_org_time_idx').on(table.organizationId, table.occurredAt),
    index('retrieval_events_agent_idx').on(table.organizationId, table.agentId),
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
