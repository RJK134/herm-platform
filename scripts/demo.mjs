#!/usr/bin/env node
// Cross-platform one-shot demo runner — dispatches to demo.bat on Windows
// and demo.sh elsewhere so `npm run demo` works regardless of host OS.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const isWindows = process.platform === 'win32';
const script = join(repoRoot, isWindows ? 'demo.bat' : 'demo.sh');

if (!existsSync(script)) {
  console.error(`Could not find ${script}. Reinstall the repo or run the steps in DEMO.md manually.`);
  process.exit(1);
}

const child = isWindows
  ? spawn('cmd.exe', ['/c', script], { cwd: repoRoot, stdio: 'inherit' })
  : spawn(script, [], { cwd: repoRoot, stdio: 'inherit' });

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
