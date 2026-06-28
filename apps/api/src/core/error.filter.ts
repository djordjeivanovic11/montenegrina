import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import { ProviderError } from '@montenegrina/provider-core';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ApiException } from './api-exception.js';

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest & { requestId?: string }>();
    const response = context.getResponse<FastifyReply>();
    const requestId = request.requestId ?? request.id;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    let retryable = false;
    let details: Record<string, unknown> | undefined;

    if (error instanceof ApiException) {
      status = error.getStatus();
      code = error.code;
      message = error.message;
      retryable = error.retryable;
      details = error.safeDetails;
    } else if (error instanceof ProviderError) {
      status = error.statusCode ?? HttpStatus.BAD_GATEWAY;
      code = error.code;
      message = error.message;
      retryable = error.retryable;
      details = error.safeDetails;
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      code = `HTTP_${status}`;
      message = error.message;
    }

    if (!(error instanceof HttpException) && !(error instanceof ProviderError)) {
      request.log.error({ err: error, requestId }, 'unhandled request error');
    }
    void response.status(status).send({
      error: {
        code,
        message,
        requestId,
        retryable,
        ...(details ? { details } : {}),
      },
    });
  }
}

