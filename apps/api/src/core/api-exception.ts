import { HttpException, HttpStatus } from '@nestjs/common';

export class ApiException extends HttpException {
  readonly code: string;
  readonly retryable: boolean;
  readonly safeDetails: Record<string, unknown> | undefined;

  constructor(options: {
    code: string;
    message: string;
    status?: HttpStatus;
    retryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(options.message, options.status ?? HttpStatus.BAD_REQUEST);
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.safeDetails = options.details;
  }
}

