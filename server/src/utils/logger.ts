import pino, { LoggerOptions } from 'pino';

const isTest = process.env['NODE_ENV'] === 'test';
const isProd = process.env['NODE_ENV'] === 'production';
const level = process.env['LOG_LEVEL'] ?? (isTest ? 'silent' : isProd ? 'info' : 'debug');

// Redact anything that could leak a credential or PII from logged objects.
// Extend this list when you start logging new request bodies or headers.
const redact: LoggerOptions['redact'] = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    '*.password',
    '*.token',
    '*.apiKey',
    '*.api_key',
    '*.secret',
  ],
  censor: '[REDACTED]',
};

const options: LoggerOptions = {
  level,
  redact,
  base: { service: 'herm-platform-server' },
};

// Pretty output in dev only — CI/prod use JSON lines for log aggregators.
const transport =
  !isProd && !isTest
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      }
    : undefined;

export const logger = transport ? pino({ ...options, transport }) : pino(options);
