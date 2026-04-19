import { createApp } from './app';
import prisma from './utils/prisma';
import { logger } from './utils/logger';

const app = createApp();
const PORT = Number(process.env['PORT'] ?? 3002);

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'HERM Platform API listening');
});

// Graceful shutdown — closes the HTTP server then disconnects Prisma before
// exiting so in-flight requests complete and DB connections are cleanly released.
function shutdown(signal: string): void {
  logger.info({ signal }, 'received signal, shutting down');
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('server and DB connections closed');
    process.exit(0);
  });
  // Force-exit after 10 seconds if graceful shutdown stalls.
  setTimeout(() => {
    logger.error('force-exit after shutdown timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
