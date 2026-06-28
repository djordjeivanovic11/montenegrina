export interface RequestActor {
  actorType: 'USER' | 'API_KEY' | 'SERVICE';
  actorId: string;
  userId?: string;
  apiKeyId?: string;
  organizationId?: string;
  permissions: Set<string>;
  csrfToken?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    actor?: RequestActor;
  }
}

