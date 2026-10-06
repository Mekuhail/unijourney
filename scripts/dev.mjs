import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let stopping = false;
const children = ['dev:server', 'dev:client'].map((script) => {
  const child = spawn(npm, ['run', script], { stdio: 'inherit' });
  child.on('exit', (code) => {
    if (stopping) return;
    stopping = true;
    process.exitCode = code ?? 1;
    for (const other of children) if (other !== child) other.kill('SIGTERM');
  });
  return child;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill(signal);
  });
}
