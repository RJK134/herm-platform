// Vercel serverless entry — mounts the entire compiled Express app on a
// single catch-all function.
//
// Lazy-imports the compiled server bundle inside the request handler so
// any error (Prisma engine missing, env-check throw, ESM/CJS interop
// issue) surfaces as a JSON 500 response we can read from curl, instead
// of Vercel's opaque FUNCTION_INVOCATION_FAILED page that the runtime-
// logs API refuses to expose without the right token scope.
//
// Once the deploy is healthy this is reverted to a top-level import.

interface RequestLike { url?: string }
interface ResponseLike {
  statusCode: number;
  setHeader(k: string, v: string): void;
  end(body?: string): void;
}

let app: ((req: unknown, res: unknown) => void) | null = null;
let initError: { message: string; stack?: string; name?: string } | null = null;

async function init(): Promise<void> {
  if (app || initError) return;
  try {
    const mod = await import('../server/dist/app.js');
    const createApp = (mod as unknown as { default?: { createApp?: () => unknown }; createApp?: () => unknown })
      .createApp ?? (mod as unknown as { default: { createApp: () => unknown } }).default.createApp;
    if (typeof createApp !== 'function') {
      throw new Error(`createApp not found on import; keys=${Object.keys(mod).join(',')}, default keys=${Object.keys((mod as { default?: object }).default ?? {}).join(',')}`);
    }
    app = createApp() as (req: unknown, res: unknown) => void;
  } catch (err) {
    const e = err as Error;
    initError = { message: e.message, stack: e.stack, name: e.name };
    // Log too in case streamed logs work for this build:
    console.error('[api/init] failed:', e.stack ?? e.message);
  }
}

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  await init();
  if (initError) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'init_failed',
      url: req.url,
      cwd: process.cwd(),
      node: process.version,
      message: initError.message,
      name: initError.name,
      stack: initError.stack?.split('\n').slice(0, 12),
    }, null, 2));
    return;
  }
  app!(req, res);
}
