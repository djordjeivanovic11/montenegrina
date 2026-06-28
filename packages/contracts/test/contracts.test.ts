import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule, { type FormatsPlugin } from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

import { canTransition, transition } from '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const addFormats = addFormatsModule as unknown as FormatsPlugin;

describe('canonical contracts', () => {
  it('loads the OpenAPI 3.1 document', () => {
    const document = YAML.parse(fs.readFileSync(path.join(root, 'openapi/openapi.yaml'), 'utf8')) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths)).toContain('/v1/agents');
  });

  it('validates a normalized event', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(root, 'schemas/realtime-event.schema.json'), 'utf8'),
    ) as object;
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    expect(
      validate({
        eventId: '018f0000-0000-7000-8000-000000000001',
        type: 'session.started',
        timestamp: '2026-06-28T12:00:00.000Z',
        organizationId: '018f0000-0000-7000-8000-000000000002',
        agentId: '018f0000-0000-7000-8000-000000000003',
        conversationId: '018f0000-0000-7000-8000-000000000004',
        traceId: '0123456789abcdef0123456789abcdef',
        sequence: 1,
        payload: { state: 'LISTENING' },
      }),
    ).toBe(true);
  });
});

describe('conversation state machine', () => {
  it('accepts interruption and recovery', () => {
    expect(canTransition('SPEAKING', 'INTERRUPTED')).toBe(true);
    expect(transition('INTERRUPTED', 'LISTENING')).toBe('LISTENING');
  });

  it('rejects transitions out of terminal state', () => {
    expect(() => transition('COMPLETED', 'LISTENING')).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONVERSATION_STATE_TRANSITION' }),
    );
  });
});
