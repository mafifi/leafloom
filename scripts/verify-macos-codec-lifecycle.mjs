import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
const executable = resolve(process.argv[2] ?? '');
if (
  process.platform !== 'darwin' ||
  !(await readFile(executable)).includes(Buffer.from('LEAFLOOM_PIPE_CODEC_V1\0'))
)
  throw Error('Expected the current macOS pipe codec executable');
const fixture = await mkdtemp(join(tmpdir(), 'leafloom-codec-parent-'));
let descriptor, parent, helperPid;
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
};
try {
  const fifo = join(fixture, 'input');
  execFileSync('/usr/bin/mkfifo', [fifo]);
  descriptor = openSync(fifo, 'r+');
  // The controller holds the FIFO open after the worker dies, so EOF cannot
  // account for helper termination. Only the helper's parent watcher can exit.
  const worker =
    "const {spawn}=require('node:child_process');const child=spawn(process.argv[1],['--leafloom-decode-webp'],{stdio:['inherit','ignore','ignore']});process.stdout.write(JSON.stringify({pid:child.pid})+'\\n');setInterval(()=>{},1000);";
  parent = spawn(process.execPath, ['-e', worker, executable], {
    stdio: [descriptor, 'pipe', 'pipe'],
  });
  let output = '';
  helperPid = await new Promise((yes, no) => {
    const timer = setTimeout(() => no(Error('Worker timeout')), 3000);
    parent.once('error', no);
    parent.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('\n')) {
        clearTimeout(timer);
        yes(JSON.parse(output.trim()).pid);
      }
    });
  });
  if (!Number.isSafeInteger(helperPid) || helperPid <= 1 || !alive(helperPid))
    throw Error('Owned helper did not start');
  const startupDelayMs = process.argv.includes('--after-startup') ? 1000 : 0;
  if (startupDelayMs) {
    await new Promise((yes) => setTimeout(yes, startupDelayMs));
    if (!alive(helperPid)) throw Error('Owned helper exited before its parent');
  }
  const exited = once(parent, 'exit');
  parent.kill('SIGKILL');
  await exited;
  const started = Date.now();
  while (alive(helperPid) && Date.now() - started < 3000)
    await new Promise((yes) => setTimeout(yes, 25));
  if (alive(helperPid)) throw Error('Pipe helper survived its owned parent');
  console.log(
    JSON.stringify({
      passed: true,
      parentSignal: 'SIGKILL',
      startupDelayMs,
      pipeHeldOpen: true,
      helperExited: true,
      elapsedMs: Date.now() - started,
      foreground: false,
    }),
  );
} finally {
  if (parent && parent.exitCode === null && parent.signalCode === null) {
    parent.kill('SIGKILL');
    await once(parent, 'exit');
  }
  if (helperPid && alive(helperPid)) process.kill(helperPid, 'SIGKILL');
  if (descriptor !== undefined) closeSync(descriptor);
  await rm(fixture, { recursive: true, force: true });
}
