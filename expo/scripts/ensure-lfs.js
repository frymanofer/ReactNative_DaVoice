#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// The models the app ships (plugins/withDaVoiceNativeAssets copies
// assets/models/local into the native app), with the size a real file has at
// least (a Git LFS pointer is ~130 bytes).
const MB = 1024 * 1024;
const FILES = [
  { file: path.join('assets', 'models', 'local', 'model_ex2_rich_kate.dm'), min: 50 * MB },
  { file: path.join('assets', 'models', 'local', 'sv.dm'), min: 1 * MB },
  { file: path.join('assets', 'models', 'local', 'hey_coach_model_28_22012026b.dm'), min: 100 * 1024 },
];

function isLFSPointer(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(256);
  const n = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const head = buf.slice(0, n).toString('utf8');
  return head.includes('git-lfs.github.com/spec/v1');
}

function hasGitLfs() {
  try {
    execSync('git lfs version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function ensureFile({ file: filePath, min: MIN_REAL_SIZE }) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required model file: ${filePath}`);
  }

  const size = fs.statSync(filePath).size;
  if (size >= MIN_REAL_SIZE) {
    return;
  }

  if (!isLFSPointer(filePath)) {
    fail(`Model file is too small (${size} bytes): ${filePath}`);
  }

  console.error(`\n⚠️ Git LFS pointer detected for ${filePath} (size=${size} bytes).`);

  if (!hasGitLfs()) {
    fail(
      'Git LFS is not installed / not on PATH.\n' +
        'Install it, then run:\n' +
        '  git lfs install\n' +
        '  git lfs pull\n'
    );
  }

  console.error(`✅ git-lfs found. Fetching LFS object for ${filePath}...`);
  run('git lfs install');

  const incl = filePath.replace(/\\/g, '/');
  run(`git lfs pull --include="${incl}"`);

  const size2 = fs.statSync(filePath).size;
  if (size2 < MIN_REAL_SIZE) {
    fail(
      `git lfs pull ran but the model is still not present.\n` +
        `Try:\n` +
        `  git lfs pull\n` +
        `  git lfs checkout\n`
    );
  }

  console.error(`✅ LFS OK. ${filePath} is now ${size2} bytes.`);
}

try {
  for (const entry of FILES) {
    ensureFile(entry);
  }
} catch (e) {
  fail(`ensure-lfs failed: ${e?.message || e}`);
}
