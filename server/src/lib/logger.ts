import pino from 'pino';

const isProduction = process.env['NODE_ENV'] === 'production';
const level = process.env['LOG_LEVEL'] ?? (isProduction ? 'info' : 'debug');

export const logger = pino({
  level,
  base: { service: 'herm-platform-server' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.apiKey',
    ],
    remove: true,
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  transport: isProduction
    ? undefined
    : {
        target: 'pino/file',
        options: { destination: 1 },
      },
});
