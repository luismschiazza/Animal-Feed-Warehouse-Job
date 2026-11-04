'use strict';
// Experimental Nest-11 alternative: no Nest CLI, no glob asset discovery, no domain changes.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const watch = process.argv.includes('--watch');
const run = process.argv.includes('--run');
const debug = process.argv.includes('--debug');
let application;
let timer;
let closing = false;
const watchers = [];

function build() {
  fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
  for (const args of [
    [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.build.json'],
    [path.join(root, 'node_modules/tsc-alias/dist/bin/index.js'), '-p', 'tsconfig.build.json'],
  ]) {
    const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
    if (result.error || result.status !== 0) {
      console.error(result.error || `Build command exited ${result.status}`);
      return false;
    }
  }
  for (const asset of ['templates', 'style']) {
    const relative = `features/mail/${asset}`;
    fs.cpSync(path.join(root, 'src', relative), path.join(root, 'dist', relative), {
      recursive: true,
    });
  }
  console.log('AFW_BUILD_READY');
  return true;
}

function launch() {
  if (!run) return;
  application = spawn(process.execPath, [
    '--enable-source-maps',
    ...(debug ? ['--inspect=127.0.0.1:9229'] : []),
    path.join(root, 'dist/main.js'),
  ], { cwd: root, stdio: 'inherit' });
  application.on('error', error => console.error(error));
  application.on('exit', code => { if (!watch && !closing) process.exitCode = code ?? 1; });
}

async function stopApplication() {
  if (!application || application.exitCode !== null || application.signalCode !== null) return;
  const current = application;
  await new Promise(resolve => {
    current.once('exit', resolve);
    current.kill('SIGTERM');
  });
}

async function shutdown() {
  if (closing) return;
  closing = true;
  clearTimeout(timer);
  watchers.forEach(watcher => watcher.close());
  await stopApplication();
  process.stdin.pause();
  process.exit(0);
}

const ready = build();
if (ready) launch();
if (!watch) {
  if (!ready) process.exitCode = 1;
} else {
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await stopApplication();
      if (!closing && build()) launch();
    }, 350);
  };
  watchers.push(fs.watch(path.join(root, 'src'), { recursive: true }, schedule));
  for (const config of ['tsconfig.json', 'tsconfig.build.json']) {
    watchers.push(fs.watch(path.join(root, config), schedule));
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.stdin.on('data', data => { if (data.toString().trim() === 'q') void shutdown(); });
}
