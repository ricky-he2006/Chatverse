import { spawn } from 'node:child_process';
const processes = [
  spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of processes) p.kill();
  process.exit(code);
}
for (const p of processes) p.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
