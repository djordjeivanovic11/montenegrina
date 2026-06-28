import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}

export function registerRequestIdHook(instance: FastifyInstance): void {
  instance.addHook('onRequest', async (request: FastifyRequest, response) => {
    const supplied = request.headers['x-request-id'];
    request.requestId = typeof supplied === 'string' && supplied.length <= 128 ? supplied : randomUUID();
    response.header('X-Request-Id', request.requestId);
  });
}

