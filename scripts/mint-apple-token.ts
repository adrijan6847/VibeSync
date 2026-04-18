#!/usr/bin/env tsx
/**
 * Mint an ES256 JWT for Apple MusicKit JS v3.
 *
 * Reads your .p8 private key at runtime — the file never leaves your machine.
 * Prints the token to stdout only; nothing is written to disk.
 *
 * Usage:
 *   tsx scripts/mint-apple-token.ts \
 *     --team    <TEAM_ID> \
 *     --key-id  <KEY_ID> \
 *     --p8      <PATH_TO_P8> \
 *     [--exp-days 180]
 *
 * Example:
 *   tsx scripts/mint-apple-token.ts \
 *     --team T4JW3CLJ69 \
 *     --key-id 89M925UD8A \
 *     --p8 ~/Downloads/AuthKey_89M925UD8A.p8
 *
 * Then either:
 *   - Paste the token into the Apple Music "developer mode" field in the app, or
 *   - Add it to .env.local:   NEXT_PUBLIC_APPLE_DEVELOPER_TOKEN=<token>
 *
 * Apple caps MusicKit developer tokens at ~6 months. Rotate before expiry.
 */

import { sign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

type Args = {
  team: string;
  keyId: string;
  p8: string;
  expDays: number;
};

const MAX_DAYS = 180;

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) {
      die(`Missing value for ${a}`);
    }
    map.set(a.slice(2), val);
    i++;
  }

  const team = map.get('team') ?? process.env.APPLE_TEAM_ID;
  const keyId = map.get('key-id') ?? process.env.APPLE_KEY_ID;
  const p8Raw = map.get('p8') ?? process.env.APPLE_P8_PATH;
  const expDays = Number(map.get('exp-days') ?? '180');

  if (!team || !keyId || !p8Raw) {
    die(
      'Usage: tsx scripts/mint-apple-token.ts --team <TEAM_ID> --key-id <KEY_ID> --p8 <PATH_TO_P8> [--exp-days 180]',
    );
  }

  if (!Number.isFinite(expDays) || expDays <= 0) {
    die('--exp-days must be a positive number');
  }

  const p8 = p8Raw.startsWith('~/')
    ? resolve(homedir(), p8Raw.slice(2))
    : resolve(p8Raw);

  return { team, keyId, p8, expDays };
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function main(): void {
  const { team, keyId, p8, expDays } = parseArgs();

  if (!existsSync(p8)) {
    die(`Private key not found: ${p8}`);
  }

  const privateKey = readFileSync(p8, 'utf8');

  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    die(
      `File at ${p8} does not look like a PEM-encoded .p8 key (missing "BEGIN PRIVATE KEY").`,
    );
  }

  const days = Math.min(expDays, MAX_DAYS);
  if (days < expDays) {
    console.error(
      `Warning: Apple caps developer tokens at ~6 months; clamped to ${MAX_DAYS} days.`,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = { iss: team, iat: now, exp: now + days * 24 * 60 * 60 };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(
    JSON.stringify(payload),
  )}`;

  // MusicKit requires the raw IEEE P1363 signature (r||s), not ASN.1 DER,
  // which is Node's default for EC keys.
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });

  process.stdout.write(`${signingInput}.${b64url(signature)}\n`);
}

main();
