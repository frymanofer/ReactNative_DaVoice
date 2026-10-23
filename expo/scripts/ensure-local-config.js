#!/usr/bin/env node
// local.config.ts holds your own API keys and is git-ignored, so a fresh
// checkout (and every EAS build, which works from git) doesn't have it. The app
// imports it: create it from local.config.example.ts when it is missing. Your
// own local.config.ts is never touched.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const target = path.join(root, 'local.config.ts');
const example = path.join(root, 'local.config.example.ts');

if (!fs.existsSync(target)) {
  fs.copyFileSync(example, target);
  console.log('[ensure-local-config] created local.config.ts from local.config.example.ts (add your keys there)');
}
