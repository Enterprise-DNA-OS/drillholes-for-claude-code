#!/usr/bin/env node
// Loads the fictional demo (one gold project, seven holes, three lab batches). Safe to run twice.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';

const db = await getDb();
try {
  await db.exec('BEGIN');
  await db.exec(readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8'));
  await db.exec('COMMIT');
  console.log('seed: fictional drillhole demo ready');
} catch (e) {
  await db.exec('ROLLBACK');
  throw e;
} finally {
  await db.close();
}
