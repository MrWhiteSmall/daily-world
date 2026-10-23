import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { timezone } from './config.js';
import { simplifyItem } from './chinese.js';

export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function createStore(file = process.env.DB_PATH || resolve('data/daily-world.sqlite')) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS snapshots (day TEXT NOT NULL, source_id TEXT NOT NULL, fetched_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(day,source_id));
    CREATE TABLE IF NOT EXISTS source_state (source_id TEXT PRIMARY KEY, attempted_at TEXT, success_at TEXT, status TEXT, error TEXT, count INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS bookmarks (id TEXT PRIMARY KEY, saved_at TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, started_at TEXT, finished_at TEXT, successful INTEGER, failed INTEGER, reason TEXT);
    CREATE TABLE IF NOT EXISTS translations (cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS snapshots_source_date ON snapshots(source_id,day DESC);`);
  return {
    db,
    save(sourceId, items, at = new Date().toISOString()) {
      const day = dayKey(new Date(at));
      db.exec('BEGIN');
      try {
        db.prepare('INSERT INTO snapshots VALUES (?,?,?,?) ON CONFLICT(day,source_id) DO UPDATE SET fetched_at=excluded.fetched_at,payload=excluded.payload').run(day, sourceId, at, JSON.stringify(items));
        db.prepare(`INSERT INTO source_state VALUES (?,?,?,'ok',NULL,?) ON CONFLICT(source_id) DO UPDATE SET attempted_at=excluded.attempted_at,success_at=excluded.success_at,status='ok',error=NULL,count=excluded.count`).run(sourceId, at, at, items.length);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    fail(sourceId, error, at = new Date().toISOString()) {
      db.prepare(`INSERT INTO source_state(source_id,attempted_at,status,error) VALUES (?,?,'error',?) ON CONFLICT(source_id) DO UPDATE SET attempted_at=excluded.attempted_at,status='error',error=excluded.error`).run(sourceId, at, String(error).slice(0, 400));
    },
    states() { return db.prepare('SELECT * FROM source_state').all(); },
    dates() { return db.prepare('SELECT DISTINCT day FROM snapshots ORDER BY day DESC').all().map(x => x.day); },
    read(day) {
      const rows = day ? db.prepare('SELECT * FROM snapshots WHERE day=?').all(day) : db.prepare('SELECT s.* FROM snapshots s JOIN (SELECT source_id,MAX(day) day FROM snapshots GROUP BY source_id) t ON s.source_id=t.source_id AND s.day=t.day').all();
      return rows.flatMap(row => JSON.parse(row.payload).map(item => simplifyItem({ ...item, snapshotDate: row.day })));
    },
    bookmarks() { return db.prepare('SELECT payload,saved_at FROM bookmarks ORDER BY saved_at DESC').all().map(row => simplifyItem({ ...JSON.parse(row.payload), savedAt: row.saved_at })); },
    bookmark(item) { db.prepare('INSERT INTO bookmarks VALUES (?,?,?) ON CONFLICT(id) DO NOTHING').run(item.id, new Date().toISOString(), JSON.stringify(item)); },
    unbookmark(id) { db.prepare('DELETE FROM bookmarks WHERE id=?').run(id); },
    find(id, { date, sourceId } = {}) {
      const matches = item => item.id === id && (!sourceId || item.sourceId === sourceId);
      const item = this.read(date).find(matches) || (!date && (this.bookmarks().find(matches) || db.prepare('SELECT payload FROM snapshots ORDER BY day DESC').all().flatMap(row => JSON.parse(row.payload)).find(matches)));
      return item ? simplifyItem(item) : item;
    },
    translation(key) { const row = db.prepare('SELECT payload FROM translations WHERE cache_key=?').get(key); return row ? JSON.parse(row.payload) : null; },
    saveTranslation(key, result) { db.prepare('INSERT INTO translations VALUES (?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,created_at=excluded.created_at').run(key, JSON.stringify(result), new Date().toISOString()); },
    startRun(reason) { return Number(db.prepare('INSERT INTO runs(started_at,reason) VALUES (?,?)').run(new Date().toISOString(), reason).lastInsertRowid); },
    finishRun(id, successful, failed) { db.prepare('UPDATE runs SET finished_at=?,successful=?,failed=? WHERE id=?').run(new Date().toISOString(), successful, failed, id); },
    runs() { return db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 12').all(); },
    close() { db.close(); },
  };
}
