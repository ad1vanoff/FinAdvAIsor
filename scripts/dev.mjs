// Runs the Vite dev server and the assistant API together.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const procs = [spawn(npm, ['run', 'dev'], { stdio: 'inherit' }), spawn(npm, ['run', 'server'], { stdio: 'inherit' })];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { stop(); process.exit(code ?? 0); });
