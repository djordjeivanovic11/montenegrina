import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import type { RequestActor } from './actor.js';

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestActor => {
    const actor = context.switchToHttp().getRequest<FastifyRequest>().actor;
    if (!actor) throw new Error('Authenticated actor is missing');
    return actor;
  },
);

