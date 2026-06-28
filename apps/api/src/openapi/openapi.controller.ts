import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { Public } from '../security/public.decorator.js';

@Controller()
export class OpenApiController {
  @Public()
  @Get('openapi.yaml')
  async document(@Res() reply: FastifyReply): Promise<void> {
    const path = fileURLToPath(import.meta.resolve('@montenegrina/contracts/openapi'));
    reply.header('Content-Type', 'application/yaml; charset=utf-8');
    await reply.send(await readFile(path, 'utf8'));
  }
}

