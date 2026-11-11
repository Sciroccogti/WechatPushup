const { storageIO } = require('./local-document');
const { normalizeDocument, freshRecords, validId } = require('../../domain/records/document');
const clone = (v) => JSON.parse(JSON.stringify(v));
const CHUNK_PREFIX = 'fitness.training.records.v1.';
const JOURNAL_KEY = 'fitness.training.transaction.v1';
const LEGACY_BACKUP_KEY = 'fitness.training.legacy-backup.v1';
const CHUNK_SIZE = 20;
let sequence = 0;
const isChunkKey = (key) => typeof key === 'string' && /^fitness\.training\.records\.v1\.[a-z0-9-]+$/.test(key);

// 不可变分块先写，索引最后提交；旧索引在失败/进程中断时仍完整有效。
class RecordDocument {
  constructor(api, key) { this.api = api; this.key = key; this.value = freshRecords(); this.warning = ''; this.locked = false; }
  _read(key) { const v = storageIO.read(this.api, key); return v === '' || v === undefined ? undefined : clone(v); }
  _cleanup(manifest) {
    const journal = this._read(JOURNAL_KEY);
    if (journal === undefined) return;
    if (journal.schemaVersion !== 1 || !Array.isArray(journal.keys) || !journal.keys.every(isChunkKey)) throw new Error('INVALID_RECORD_JOURNAL');
    const referenced = new Set(manifest && manifest.schemaVersion === 2 ? manifest.chunks.map((c) => c.key) : []);
    for (const key of journal.keys) if (!referenced.has(key)) storageIO.remove(this.api, key);
    storageIO.remove(this.api, JOURNAL_KEY);
  }
  load() {
    this.warning = ''; this.locked = false; this._cleanupPending = false;
    try {
      const raw = this._read(this.key); this._manifest = raw;
      let doc;
      if (raw === undefined) doc = freshRecords();
      else if (!raw || typeof raw !== 'object') throw new Error('INVALID_RECORD_INDEX');
      else if (raw.schemaVersion === 1) doc = normalizeDocument(raw);
      else if (raw.schemaVersion === 2) {
        if (!Number.isSafeInteger(raw.revision) || raw.revision < 1 || !Array.isArray(raw.chunks) || raw.chunks.some((c) => !c || !isChunkKey(c.key) || !Array.isArray(c.ids) || c.ids.length < 1 || c.ids.length > CHUNK_SIZE || !c.ids.every(validId)) || new Set(raw.chunks.map((c) => c.key)).size !== raw.chunks.length) throw new Error('INVALID_RECORD_INDEX');
        const results = {}, order = [];
        for (const c of raw.chunks) {
          const chunk = this._read(c.key);
          if (!chunk || chunk.schemaVersion !== 1 || !chunk.results || Object.keys(chunk.results).length !== c.ids.length) throw new Error('MISSING_RECORD_CHUNK');
          for (const id of c.ids) { if (!chunk.results[id] || results[id]) throw new Error('INVALID_RECORD_CHUNK'); results[id] = chunk.results[id]; order.push(id); }
        }
        if (JSON.stringify(order) !== JSON.stringify(raw.savedOrder)) throw new Error('INVALID_RECORD_ORDER');
        doc = normalizeDocument({ ...raw, results });
      } else throw new Error('UNSUPPORTED_RECORD_VERSION');
      this.value = doc;
      try { this._cleanup(raw); } catch (_) { this.warning = '训练数据可读取，但临时分块未能清理；保存前将重试。'; this._cleanupPending = true; }
    } catch (_) {
      this.locked = true; this.value = freshRecords();
      this.warning = '训练数据损坏、分块缺失或版本不受支持，已保留原数据并停止写入。';
    }
    return clone(this.value);
  }
  update(change) {
    const before = this.load();
    if (this.locked) return false;
    if (this._cleanupPending) { try { this._cleanup(this._manifest); this._cleanupPending = false; } catch (_) { return false; } }
    const next = clone(before); change(next);
    const validated = normalizeDocument(next);
    if (JSON.stringify(before) === JSON.stringify(validated)) return true;
    const old = this._manifest, oldChunks = old && old.schemaVersion === 2 ? old.chunks : [];
    const chunks = [], writes = [];
    for (let i = 0; i < validated.savedOrder.length; i += CHUNK_SIZE) {
      const ids = validated.savedOrder.slice(i, i + CHUNK_SIZE);
      const prior = oldChunks[i / CHUNK_SIZE];
      if (prior && JSON.stringify(prior.ids) === JSON.stringify(ids) && ids.every((id) => JSON.stringify(before.results[id]) === JSON.stringify(validated.results[id]))) chunks.push(prior);
      else {
        const key = CHUNK_PREFIX + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) + '-' + (++sequence);
        const results = {}; for (const id of ids) results[id] = validated.results[id];
        writes.push({ key, value: { schemaVersion: 1, results } }); chunks.push({ key, ids });
      }
    }
    const manifest = { schemaVersion: 2, revision: old && old.schemaVersion === 2 ? old.revision + 1 : 1,
      profiles: validated.profiles, savedOrder: validated.savedOrder, chunks, tombstones: validated.tombstones, assessments: validated.assessments };
    const keys = [...new Set([...writes.map((w) => w.key), ...oldChunks.filter((c) => !chunks.some((v) => v.key === c.key)).map((c) => c.key)])];
    try {
      storageIO.write(this.api, JOURNAL_KEY, { schemaVersion: 1, keys });
      for (const w of writes) storageIO.write(this.api, w.key, w.value);
      if (old && old.schemaVersion === 1) {
        const backup = this._read(LEGACY_BACKUP_KEY);
        if (backup !== undefined && JSON.stringify(backup) !== JSON.stringify(old)) throw new Error('LEGACY_BACKUP_CONFLICT');
        if (backup === undefined) storageIO.write(this.api, LEGACY_BACKUP_KEY, old);
      }
      storageIO.write(this.api, this.key, manifest);
    } catch (_) {
      this.value = before;
      try { this._cleanup(old); } catch (_) { /* 下次load继续清理，原索引未提交。 */ }
      this.warning = '训练数据保存失败，可能空间不足；原记录和计划保留，请重试或先导出备份。'; return false;
    }
    this.value = validated; this._manifest = manifest;
    try { this._cleanup(manifest); this.warning = ''; this._cleanupPending = false; }
    catch (_) { this.warning = '训练数据已保存，旧临时分块稍后清理。'; this._cleanupPending = true; }
    return true;
  }
}
module.exports = { RecordDocument, CHUNK_PREFIX, CHUNK_SIZE, JOURNAL_KEY, LEGACY_BACKUP_KEY };
