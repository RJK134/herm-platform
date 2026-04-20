import prisma from './utils/prisma';
import app from './app';

const PORT = process.env['PORT'] || 3002;

const server = app.listen(PORT, () => {
  console.log(`HERM Platform API running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown — closes HTTP server then disconnects Prisma before exiting
// Ensures in-flight requests complete and DB connections are cleanly released
function shutdown(signal: string) {
  console.log(`[SHUTDOWN] Received ${signal} — shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    console.log('[SHUTDOWN] Server and DB connections closed');
    process.exit(0);
  });
  // Force-exit after 10 seconds if graceful shutdown stalls
  setTimeout(() => {
    console.error('[SHUTDOWN] Force-exit after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

export default app;
