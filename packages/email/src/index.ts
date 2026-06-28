import type { Environment } from '@montenegrina/config';

import { ConsoleEmailProvider } from './providers/console.provider.js';
import { ResendEmailProvider } from './providers/resend.provider.js';
import type { EmailService } from './types.js';

export type { EmailMessage, EmailService } from './types.js';

export function createEmailService(environment: Pick<
  Environment,
  'EMAIL_PROVIDER' | 'RESEND_API_KEY' | 'EMAIL_FROM'
>): EmailService {
  if (environment.EMAIL_PROVIDER === 'resend' && environment.RESEND_API_KEY) {
    return new ResendEmailProvider(environment.RESEND_API_KEY, environment.EMAIL_FROM);
  }
  return new ConsoleEmailProvider(environment.EMAIL_FROM);
}
