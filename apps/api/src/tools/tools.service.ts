import { lookup } from 'node:dns/promises';
import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { schema } from '@montenegrina/database';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import { and, desc, eq } from 'drizzle-orm';
import ipaddr from 'ipaddr.js';
import { v7 as uuidv7 } from 'uuid';

import { ApiException } from '../core/api-exception.js';
import { DatabaseService } from '../database/database.service.js';
import type { RuntimeClaims } from '../internal/internal-token.service.js';
import type { RequestActor } from '../security/actor.js';

const handlers = new Set([
  'sandbox.product_lookup',
  'sandbox.appointment_availability',
  'sandbox.appointment_create',
  'sandbox.request_status',
  'sandbox.handoff',
  'fixed_https',
]);

function isPublicIp(address: string): boolean {
  return ['unicast'].includes(ipaddr.parse(address).range());
}

interface ToolInput {
  name: string;
  version: number;
  description: string;
  riskClass: 'READ_PUBLIC' | 'READ_CUSTOMER' | 'WRITE_REVERSIBLE' | 'WRITE_SENSITIVE';
  handler: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  connectorConfig?: Record<string, unknown>;
  enabled?: boolean;
}

@Injectable()
export class ToolsService {
  readonly #ajv = new Ajv2020({ strict: true, allErrors: true });

  constructor(private readonly database: DatabaseService) {}

  async list(actor: RequestActor) {
    const items = await this.database.db.query.toolDefinitions.findMany({
      where: eq(schema.toolDefinitions.organizationId, this.organization(actor)),
      orderBy: [desc(schema.toolDefinitions.createdAt)],
    });
    return { items: items.map((item) => this.format(item)) };
  }

  async create(actor: RequestActor, input: ToolInput) {
    const organizationId = this.organization(actor);
    await this.validateDefinition(input);
    const id = uuidv7();
    await this.database.db.insert(schema.toolDefinitions).values({
      id,
      organizationId,
      name: input.name,
      version: input.version,
      description: input.description,
      riskClass: input.riskClass,
      handler: input.handler,
      inputSchema: input.inputSchema,
      outputSchema: input.outputSchema,
      connectorConfig: input.connectorConfig,
      enabled: input.enabled ?? true,
    });
    return this.get(actor, id);
  }

  async update(actor: RequestActor, id: string, input: ToolInput) {
    const current = await this.getRecord(actor, id);
    if (current.immutable) throw new ApiException({ code: 'TOOL_IMMUTABLE', message: 'Published tool versions cannot be modified.', status: 409 });
    await this.validateDefinition(input);
    await this.database.db
      .update(schema.toolDefinitions)
      .set({
        description: input.description,
        riskClass: input.riskClass,
        handler: input.handler,
        inputSchema: input.inputSchema,
        outputSchema: input.outputSchema,
        connectorConfig: input.connectorConfig,
        enabled: input.enabled ?? true,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.toolDefinitions.organizationId, this.organization(actor)), eq(schema.toolDefinitions.id, id)));
    return this.get(actor, id);
  }

  async invoke(
    claims: RuntimeClaims,
    name: string,
    input: Record<string, unknown>,
    idempotencyKey?: string,
  ) {
    const definition = await this.database.db.query.toolDefinitions.findFirst({
      where: and(
        eq(schema.toolDefinitions.organizationId, claims.organizationId),
        eq(schema.toolDefinitions.name, name),
        eq(schema.toolDefinitions.enabled, true),
      ),
      orderBy: [desc(schema.toolDefinitions.version)],
    });
    if (!definition) throw new ApiException({ code: 'TOOL_NOT_FOUND', message: 'The requested tool is unavailable.', status: 404 });
    const agentVersion = await this.database.db.query.agentVersions.findFirst({
      where: and(
        eq(schema.agentVersions.organizationId, claims.organizationId),
        eq(schema.agentVersions.id, claims.agentVersionId),
      ),
    });
    if (!agentVersion || !agentVersion.config.toolIds.includes(definition.id)) {
      throw new ApiException({ code: 'TOOL_NOT_AUTHORIZED', message: 'The tool is not enabled for this agent.', status: 403 });
    }
    this.validateInput(definition.inputSchema, input);
    const id = uuidv7();
    const needsConfirmation =
      definition.riskClass === 'WRITE_REVERSIBLE' || definition.riskClass === 'WRITE_SENSITIVE';
    if (definition.riskClass === 'WRITE_SENSITIVE' && !agentVersion.config.sensitiveWritesEnabled) {
      throw new ApiException({ code: 'SENSITIVE_TOOL_DISABLED', message: 'Sensitive writes are disabled for this agent.', status: 403 });
    }
    await this.database.db.insert(schema.toolInvocations).values({
      id,
      organizationId: claims.organizationId,
      conversationId: claims.conversationId,
      agentId: claims.agentId,
      toolDefinitionId: definition.id,
      toolVersion: definition.version,
      status: needsConfirmation ? 'AWAITING_CONFIRMATION' : 'RUNNING',
      validatedInput: input,
      authorizationPolicy: {
        riskClass: definition.riskClass,
        sensitiveWritesEnabled: agentVersion.config.sensitiveWritesEnabled,
      },
      idempotencyKey,
    });
    if (needsConfirmation) {
      return { id, status: 'AWAITING_CONFIRMATION', confirmationRequired: true };
    }
    return this.executeInvocation(definition, id, input);
  }

  async runtimeDefinitions(claims: RuntimeClaims) {
    const version = await this.database.db.query.agentVersions.findFirst({
      where: and(
        eq(schema.agentVersions.organizationId, claims.organizationId),
        eq(schema.agentVersions.id, claims.agentVersionId),
      ),
    });
    if (!version) throw new ApiException({ code: 'RUNTIME_SCOPE_MISMATCH', message: 'Runtime scope is invalid.', status: 403 });
    if (version.config.toolIds.length === 0) return [];
    const definitions = await this.database.db.query.toolDefinitions.findMany({
      where: and(
        eq(schema.toolDefinitions.organizationId, claims.organizationId),
        eq(schema.toolDefinitions.enabled, true),
      ),
      orderBy: [desc(schema.toolDefinitions.version)],
    });
    const allowed = new Set(version.config.toolIds);
    return definitions.filter((item) => allowed.has(item.id)).map((item) => ({
      name: item.name,
      description: item.description,
      inputSchema: item.inputSchema,
      riskClass: item.riskClass,
    }));
  }

  async confirm(
    actor: RequestActor,
    conversationId: string,
    invocationId: string,
    confirmed: boolean,
    confirmationText: string,
  ) {
    const organizationId = this.organization(actor);
    const invocation = await this.database.db.query.toolInvocations.findFirst({
      where: and(
        eq(schema.toolInvocations.organizationId, organizationId),
        eq(schema.toolInvocations.conversationId, conversationId),
        eq(schema.toolInvocations.id, invocationId),
      ),
    });
    if (!invocation || invocation.status !== 'AWAITING_CONFIRMATION') {
      throw new ApiException({ code: 'TOOL_CONFIRMATION_NOT_PENDING', message: 'No confirmation is pending.', status: 409 });
    }
    if (!confirmed) {
      await this.database.db
        .update(schema.toolInvocations)
        .set({ status: 'REJECTED', confirmationText, updatedAt: new Date() })
        .where(eq(schema.toolInvocations.id, invocationId));
      return { id: invocationId, conversationId, toolId: invocation.toolDefinitionId, status: 'REJECTED', input: invocation.validatedInput };
    }
    const definition = await this.database.db.query.toolDefinitions.findFirst({
      where: and(
        eq(schema.toolDefinitions.organizationId, organizationId),
        eq(schema.toolDefinitions.id, invocation.toolDefinitionId),
      ),
    });
    if (!definition) throw new ApiException({ code: 'TOOL_NOT_FOUND', message: 'The tool version is unavailable.', status: 404 });
    await this.database.db
      .update(schema.toolInvocations)
      .set({ status: 'RUNNING', confirmationText, confirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.toolInvocations.id, invocationId));
    return this.executeInvocation(definition, invocationId, invocation.validatedInput);
  }

  private async executeInvocation(
    definition: typeof schema.toolDefinitions.$inferSelect,
    invocationId: string,
    input: Record<string, unknown>,
  ) {
    const startedAt = Date.now();
    try {
      const result = await this.executeHandler(definition, input);
      await this.database.db
        .update(schema.toolInvocations)
        .set({ status: 'COMPLETED', result, latencyMs: Date.now() - startedAt, updatedAt: new Date() })
        .where(eq(schema.toolInvocations.id, invocationId));
      return {
        id: invocationId,
        conversationId: (await this.database.db.query.toolInvocations.findFirst({
          where: eq(schema.toolInvocations.id, invocationId),
        }))?.conversationId ?? '',
        toolId: definition.id,
        status: 'COMPLETED',
        input,
        result,
      };
    } catch (error) {
      await this.database.db
        .update(schema.toolInvocations)
        .set({ status: 'FAILED', errorCode: 'TOOL_EXECUTION_FAILED', latencyMs: Date.now() - startedAt, updatedAt: new Date() })
        .where(eq(schema.toolInvocations.id, invocationId));
      throw error;
    }
  }

  private async executeHandler(
    definition: typeof schema.toolDefinitions.$inferSelect,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (definition.handler) {
      case 'sandbox.product_lookup':
        return {
          products: [
            { id: 'basic', name: 'Osnovni paket', price: '9.90 EUR' },
            { id: 'business', name: 'Poslovni paket', price: '29.90 EUR' },
          ],
        };
      case 'sandbox.appointment_availability':
        return { date: input.date ?? '2026-07-01', available: ['09:00', '10:00', '14:00'] };
      case 'sandbox.appointment_create':
        return {
          appointmentId: `apt_${createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 12)}`,
          status: 'CONFIRMED',
          ...input,
        };
      case 'sandbox.request_status':
        return { requestId: input.requestId ?? 'REQ-1001', status: 'U_OBRADI' };
      case 'sandbox.handoff':
        return { requested: true, queue: 'default' };
      case 'fixed_https':
        return this.executeFixedHttps(definition.connectorConfig ?? {}, input);
      default:
        throw new ApiException({ code: 'TOOL_HANDLER_INVALID', message: 'The tool handler is not allowed.', status: 422 });
    }
  }

  private async executeFixedHttps(config: Record<string, unknown>, input: Record<string, unknown>) {
    const url = await this.validateConnector(config);
    const method = String(config.method ?? 'POST');
    const timeoutMs = Math.min(15_000, Math.max(100, Number(config.timeoutMs ?? 5_000)));
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const secretRef = typeof config.secretRef === 'string' ? config.secretRef : undefined;
    if (secretRef?.startsWith('env://')) {
      const secret = process.env[secretRef.slice(6)];
      if (!secret) throw new ApiException({ code: 'TOOL_SECRET_UNAVAILABLE', message: 'The tool credential is unavailable.', status: 503 });
      headers.Authorization = `Bearer ${secret}`;
    }
    const response = await fetch(url, {
      method,
      headers,
      ...(method === 'GET' ? {} : { body: JSON.stringify(input) }),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new ApiException({ code: 'TOOL_REMOTE_ERROR', message: 'The company tool returned an error.', status: 502, retryable: response.status >= 500 });
    const result = (await response.json()) as unknown;
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new ApiException({ code: 'TOOL_RESULT_INVALID', message: 'The company tool returned an invalid result.', status: 502 });
    }
    return result as Record<string, unknown>;
  }

  private async validateDefinition(input: ToolInput): Promise<void> {
    if (!handlers.has(input.handler)) throw new ApiException({ code: 'TOOL_HANDLER_INVALID', message: 'The tool handler is not allowed.', status: 422 });
    try {
      this.#ajv.compile(input.inputSchema);
      if (input.outputSchema) this.#ajv.compile(input.outputSchema);
    } catch (error) {
      throw new ApiException({ code: 'TOOL_SCHEMA_INVALID', message: 'The tool JSON Schema is invalid.', status: 422, details: { cause: error instanceof Error ? error.message : 'unknown' } });
    }
    if (input.handler === 'fixed_https') await this.validateConnector(input.connectorConfig ?? {});
  }

  private validateInput(schemaValue: Record<string, unknown>, input: Record<string, unknown>): void {
    const validate: ValidateFunction = this.#ajv.compile(schemaValue);
    if (!validate(input)) {
      throw new ApiException({ code: 'TOOL_INPUT_INVALID', message: 'Tool arguments do not match the registered schema.', status: 422, details: { errors: validate.errors ?? [] } });
    }
  }

  private async validateConnector(config: Record<string, unknown>): Promise<URL> {
    let url: URL;
    try {
      url = new URL(String(config.url ?? ''));
    } catch {
      throw new ApiException({ code: 'TOOL_CONNECTOR_INVALID', message: 'The connector URL is invalid.', status: 422 });
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) {
      throw new ApiException({ code: 'TOOL_CONNECTOR_REJECTED', message: 'Connectors require a fixed HTTPS URL.', status: 422 });
    }
    const method = String(config.method ?? 'POST');
    if (!['GET', 'POST', 'PUT', 'PATCH'].includes(method)) {
      throw new ApiException({ code: 'TOOL_CONNECTOR_METHOD_REJECTED', message: 'The connector method is not allowed.', status: 422 });
    }
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => !isPublicIp(entry.address))) {
      throw new ApiException({ code: 'TOOL_CONNECTOR_ADDRESS_REJECTED', message: 'The connector address is not public.', status: 422 });
    }
    return url;
  }

  private async get(actor: RequestActor, id: string) {
    return this.format(await this.getRecord(actor, id));
  }

  private async getRecord(actor: RequestActor, id: string) {
    const item = await this.database.db.query.toolDefinitions.findFirst({
      where: and(eq(schema.toolDefinitions.organizationId, this.organization(actor)), eq(schema.toolDefinitions.id, id)),
    });
    if (!item) throw new ApiException({ code: 'TOOL_NOT_FOUND', message: 'Tool was not found.', status: 404 });
    return item;
  }

  private organization(actor: RequestActor): string {
    if (!actor.organizationId) throw new ApiException({ code: 'ORGANIZATION_REQUIRED', message: 'Select an organization.', status: 400 });
    return actor.organizationId;
  }

  private format(item: typeof schema.toolDefinitions.$inferSelect) {
    return {
      id: item.id,
      organizationId: item.organizationId,
      name: item.name,
      version: item.version,
      description: item.description,
      riskClass: item.riskClass,
      handler: item.handler,
      inputSchema: item.inputSchema,
      outputSchema: item.outputSchema,
      connectorConfig: item.connectorConfig,
      enabled: item.enabled,
    };
  }
}
