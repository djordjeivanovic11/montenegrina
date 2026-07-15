export const loggerRedaction = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers.set-cookie',
    'req.body.password',
    'req.body.token',
    'req.body.turnstileToken',
    'req.body.credential',
    '*.password',
    '*.apiKey',
    '*.secret',
  ],
  censor: '[REDACTED]',
};
