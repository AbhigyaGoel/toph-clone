#!/usr/bin/env node
/**
 * Pushes this deployment's environment to Vercel.
 *
 * Run once, after `vercel login` and `vercel link`. Reads the values that are
 * genuinely shared with local development out of `.env.local`, and *generates*
 * the two that should not be: a production deployment reusing a development
 * signing key means a laptop can mint session cookies the production site will
 * accept.
 *
 * Values are piped to the CLI on stdin rather than passed as arguments, so they
 * do not appear in the process list or in a shell history file. Nothing here
 * prints a secret — only its name and length.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Copied from `.env.local` — the same database, the same keys. */
const SHARED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SECRET_KEY',
];

/** Optional; set them locally first and they come along. */
const OPTIONAL = ['OPENAI_API_KEY', 'DEEPGRAM_API_KEY', 'OPENAI_EXTRACT_MODEL'];

/** Generated fresh for the deployment rather than shared with a laptop. */
const GENERATED = {
  SESSION_SECRET: () => randomBytes(48).toString('base64url'),
  INGEST_API_KEY: () => randomBytes(32).toString('base64url'),
};

/**
 * Fixed for this platform.
 *
 * Vercel overwrites `x-forwarded-for` at the edge, so it can be believed here —
 * which is what lets the per-client half of the rate limiter do anything at
 * all. On a bare Node host it is attacker-controlled and stays false.
 */
const FIXED = { TRUST_PROXY_HEADERS: 'true' };

const TARGETS = ['production', 'preview'];

function parseEnvFile(path) {
  const out = new Map();
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return out;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    // Strip one layer of matching quotes, which dotenv files often carry.
    const value = trimmed.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (key) out.set(key, value);
  }
  return out;
}

function pushVar(name, value, target) {
  return new Promise((resolve) => {
    // `shell: true` on Windows, where Node refuses to spawn a `.cmd` directly.
    // Only the fixed argument names go through the shell — every value is piped
    // on stdin, so nothing user-supplied is ever parsed as a command.
    const child = spawn(
      'npx',
      ['vercel', 'env', 'add', name, target, '--force'],
      { stdio: ['pipe', 'pipe', 'pipe'], shell: process.platform === 'win32' }
    );

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.stdout.on('data', () => {});

    child.stdin.write(value);
    child.stdin.end();

    child.on('close', (code) => resolve({ ok: code === 0, stderr }));
  });
}

async function main() {
  const local = parseEnvFile('.env.local');
  const missing = SHARED.filter((name) => !local.get(name));
  if (missing.length > 0) {
    console.error(`.env.local is missing: ${missing.join(', ')}`);
    process.exit(1);
  }

  const values = new Map();
  for (const name of SHARED) values.set(name, local.get(name));
  for (const name of OPTIONAL) {
    const value = local.get(name);
    if (value) values.set(name, value);
  }
  for (const [name, make] of Object.entries(GENERATED)) values.set(name, make());
  for (const [name, value] of Object.entries(FIXED)) values.set(name, value);

  for (const target of TARGETS) {
    for (const [name, value] of values) {
      // eslint-disable-next-line no-await-in-loop -- the CLI writes one at a time
      const { ok, stderr } = await pushVar(name, value, target);
      const label = `${name} (${value.length} chars) -> ${target}`;
      console.log(ok ? `  set   ${label}` : `  FAIL  ${label}\n${stderr.trim()}`);
    }
  }

  console.log('\nGenerated for this deployment only — keep a copy if you need them:');
  for (const name of Object.keys(GENERATED)) {
    console.log(`  ${name}=${values.get(name)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
