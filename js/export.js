// Backups: one JSON file with everything (transactions, categories, rules,
// people, settings). Also the way to move data between iPhone and laptop,
// since each browser keeps its own separate storage.

import * as db from './db.js';

const FORMAT = 'paris-expenses-backup';
const FORMAT_VERSION = 1;
const DATA_STORES = ['transactions', 'categories', 'rules', 'people', 'settings', 'imports'];

export async function buildBackup() {
  const data = {};
  for (const name of DATA_STORES) data[name] = await db.getAll(name);
  return { format: FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), data };
}

/** Save a file: share sheet on phones (→ Save to Files), plain download elsewhere. */
export async function saveFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;   // user closed the share sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export async function downloadBackup() {
  const backup = await buildBackup();
  const stamp = backup.exportedAt.slice(0, 16).replace(/[:T]/g, '-');
  const ok = await saveFile(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `paris-expenses-backup-${stamp}.json`);
  if (ok) await db.put('meta', { key: 'lastBackupAt', value: backup.exportedAt });
  return ok;
}

export async function lastBackupAt() {
  return (await db.get('meta', 'lastBackupAt'))?.value ?? null;
}

/** Validate and summarise a backup file before restoring it. */
export function inspectBackup(json) {
  let parsed;
  try { parsed = JSON.parse(json); } catch { throw new Error('This file is not valid JSON.'); }
  if (parsed?.format !== FORMAT || typeof parsed.data !== 'object') throw new Error('This is not a Paris Expenses backup file.');
  if (parsed.version > FORMAT_VERSION) throw new Error('This backup comes from a newer version of the app. Update the app first.');
  const counts = Object.fromEntries(DATA_STORES.map((n) => [n, Array.isArray(parsed.data[n]) ? parsed.data[n].length : 0]));
  return { backup: parsed, counts };
}

/**
 * mode 'merge': add records whose id isn't here yet (never overwrites).
 * mode 'replace': wipe and load exactly what's in the file.
 * Returns how many records were added per store.
 */
export async function restoreBackup(backup, mode = 'merge') {
  const changes = {};
  const added = {};
  for (const name of DATA_STORES) {
    const incoming = Array.isArray(backup.data[name]) ? backup.data[name] : [];
    const keyPath = db.STORES[name].keyPath;
    if (mode === 'replace') {
      changes[name] = { clear: true, put: incoming };
      added[name] = incoming.length;
    } else {
      const existing = new Set((await db.getAll(name)).map((r) => r[keyPath]));
      const fresh = incoming.filter((r) => !existing.has(r[keyPath]));
      changes[name] = { put: fresh };
      added[name] = fresh.length;
    }
  }
  await db.batch(changes);
  db.emitDataChange();
  return added;
}
