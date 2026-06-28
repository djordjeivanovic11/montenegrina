import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { AudioEncoding, AudioFormat } from '@montenegrina/provider-core';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ApiException } from '../core/api-exception.js';
import type { RequestActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.decorator.js';
import { RequirePermissions } from '../security/permissions.decorator.js';
import { ProviderService } from './provider.service.js';

function parseWavFormat(bytes: Uint8Array): AudioFormat | undefined {
  if (bytes.byteLength < 28 || new TextDecoder().decode(bytes.slice(0, 4)) !== 'RIFF') return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { encoding: 'wav', channels: view.getUint16(22, true), sampleRate: view.getUint32(24, true) };
}

function fieldValue(
  fields: Record<string, unknown>,
  name: string,
): string | undefined {
  const field = fields[name] as { value?: unknown } | undefined;
  return typeof field?.value === 'string' ? field.value : undefined;
}

@Controller('v1')
export class ProviderController {
  constructor(private readonly providers: ProviderService) {}

  @Post('transcriptions')
  @RequirePermissions('conversations:create')
  async transcribe(@CurrentActor() actor: RequestActor, @Req() request: FastifyRequest) {
    const file = await request.file({ limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
    if (!file) throw new ApiException({ code: 'AUDIO_REQUIRED', message: 'An audio file is required.' });
    const audio = await file.toBuffer();
    const fields = file.fields as Record<string, unknown>;
    const agentId = fieldValue(fields, 'agentId');
    if (!agentId) throw new ApiException({ code: 'AGENT_ID_REQUIRED', message: 'agentId is required.' });
    const wavFormat = parseWavFormat(audio);
    const requestedEncoding = fieldValue(fields, 'encoding') as AudioEncoding | undefined;
    const sampleRate = Number(fieldValue(fields, 'sampleRate'));
    const channels = Number(fieldValue(fields, 'channels'));
    const audioFormat =
      wavFormat ??
      (requestedEncoding && Number.isInteger(sampleRate) && Number.isInteger(channels)
        ? { encoding: requestedEncoding, sampleRate, channels }
        : undefined);
    if (!audioFormat) {
      throw new ApiException({
        code: 'AUDIO_FORMAT_REQUIRED',
        message: 'Non-WAV uploads require encoding, sampleRate, and channels fields.',
      });
    }
    const language = fieldValue(fields, 'sttLanguage');
    return this.providers.transcribe({
      actor,
      requestId: request.requestId,
      agentId,
      audio,
      audioFormat,
      ...(language === 'sr' || language === 'hr' || language === 'bs' || language === 'multi'
        ? { sttLanguage: language }
        : {}),
    });
  }

  @Post('responses')
  @RequirePermissions('conversations:create')
  respond(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Body() body: { agentId: string; conversationId?: string; input: string },
  ) {
    return this.providers.respond({ actor, requestId: request.requestId, ...body });
  }

  @Post('speech')
  @RequirePermissions('conversations:create')
  async speech(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Body() body: { agentId: string; text: string; format?: 'wav' | 'pcm' },
  ): Promise<void> {
    const format: AudioFormat = {
      encoding: body.format === 'pcm' ? 'pcm_s16le' : 'wav',
      sampleRate: 24_000,
      channels: 1,
    };
    const result = await this.providers.speech({
      actor,
      requestId: request.requestId,
      agentId: body.agentId,
      text: body.text,
      outputFormat: format,
    });
    reply.header('Content-Type', body.format === 'pcm' ? 'audio/pcm' : 'audio/wav');
    reply.header('X-Provider', result.metadata.provider);
    await reply.send(Buffer.from(result.data));
  }

  @Post('embeddings')
  @RequirePermissions('knowledge:create')
  embed(
    @CurrentActor() actor: RequestActor,
    @Req() request: FastifyRequest,
    @Body() body: { texts: string[]; agentId?: string },
  ) {
    return this.providers.embed({ actor, requestId: request.requestId, ...body });
  }
}

