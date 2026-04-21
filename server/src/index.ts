import prisma from './utils/prisma';
import { logger } from './lib/logger';
import app from './app';

const PORT = process.env['PORT'] || 3002;

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, `HERM Platform API running on http://localhost:${PORT}`);
});

// Graceful shutdown — closes HTTP server then disconnects Prisma before exiting
// Ensures in-flight requests complete and DB connections are cleanly released
const shutdown = (signal: string) => {
  logger.info({ signal }, 'shutting down gracefully');
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('server and db connections closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('force-exit after timeout');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
