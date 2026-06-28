import { randomUUID } from 'node:crypto';

import type { Database } from '@montenegrina/database';
import { schema } from '@montenegrina/database';
import { and, eq } from 'drizzle-orm';

import { decryptWebhookSecret, webhookSignatureHeader } from './webhook-crypto.js';

export class WebhookDeliveryProcessor {
  constructor(
    private readonly database: Database,
    private readonly platformSecret: string,
    private readonly webhooksEnabled: boolean,
  ) {}

  async process(data: Record<string, unknown>): Promise<void> {
    if (!this.webhooksEnabled) return;

    const organizationId = String(data.organizationId);
    const eventType = String(data.eventType);
    const payload = (data.payload ?? {}) as Record<string, unknown>;
    const body = JSON.stringify({
      id: data.deliveryId ?? randomUUID(),
      type: eventType,
      createdAt: new Date().toISOString(),
      data: payload,
    });

    const allEndpoints = await this.database.query.webhookEndpoints.findMany({
      where: and(
        eq(schema.webhookEndpoints.organizationId, organizationId),
        eq(schema.webhookEndpoints.enabled, true),
      ),
    });
    const endpoints = allEndpoints.filter((endpoint) => endpoint.events.includes(eventType));

    for (const endpoint of endpoints) {
      if (!endpoint.secretCiphertext) continue;
      const secret = decryptWebhookSecret(endpoint.secretCiphertext, this.platformSecret);
      const signature = webhookSignatureHeader(body, secret);
      let delivered = false;
      for (let attempt = 0; attempt < 3 && !delivered; attempt += 1) {
        try {
          const response = await fetch(endpoint.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Montenegrina-Signature': signature,
              'X-Montenegrina-Event': eventType,
            },
            body,
            signal: AbortSignal.timeout(10_000),
          });
          if (response.ok) {
            delivered = true;
            await this.database
              .update(schema.webhookEndpoints)
              .set({ lastDeliveryAt: new Date(), updatedAt: new Date() })
              .where(eq(schema.webhookEndpoints.id, endpoint.id));
          } else if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1_000));
          }
        } catch {
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1_000));
          }
        }
      }
    }
  }
}
