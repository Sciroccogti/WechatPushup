const { normalizeDocument } = require('./document');
const FORMAT = 'fitness-coach-backup';
const MAX_TEXT = 4 * 1024 * 1024;
function encodeBackup(document, at) { return JSON.stringify({ format: FORMAT, schemaVersion: 1, exportedAt: at, data: normalizeDocument(document) }, null, 2); }
function decodeBackup(text) {
  if (typeof text !== 'string' || text.length > MAX_TEXT) throw new Error('备份内容为空或过大。');
  let input; try { input = JSON.parse(text); } catch (_) { throw new Error('备份不是有效的JSON文本。'); }
  if (!input || input.format !== FORMAT || input.schemaVersion !== 1 || !Number.isFinite(input.exportedAt)) throw new Error('备份格式或版本不受支持。');
  try { return normalizeDocument(input.data); } catch (_) { throw new Error('备份数据校验失败，未改动本地记录。'); }
}
function mergeBackup(local, incoming) {
  const next = normalizeDocument(local), source = normalizeDocument(incoming);
  const report = { added: 0, duplicates: 0, conflicts: 0, blockedByDeletion: 0, profiles: 0, assessments: 0 };
  for (const id of source.savedOrder) {
    if (next.tombstones[id]) { report.blockedByDeletion++; continue; }
    if (next.results[id]) {
      if (JSON.stringify(next.results[id]) === JSON.stringify(source.results[id])) report.duplicates++;
      else report.conflicts++;
      continue;
    }
    next.results[id] = source.results[id]; next.savedOrder.push(id); report.added++;
  }
  // 本机计划、现存记录与删除标记优先。备份文件本身保留冲突副本，不静默覆盖。
  for (const [id, t] of Object.entries(source.tombstones)) if (!next.results[id] && !next.tombstones[id]) next.tombstones[id] = t;
  for (const [id, p] of Object.entries(source.profiles)) {
    if (!next.profiles[id]) { next.profiles[id] = p; report.profiles++; }
  }
  for (const [id, a] of Object.entries(source.assessments)) {
    if (!next.assessments[id]) { next.assessments[id] = a; report.assessments++; }
    else if (JSON.stringify(next.assessments[id]) !== JSON.stringify(a)) report.conflicts++;
  }
  return { document: normalizeDocument(next), report };
}
module.exports = { encodeBackup, decodeBackup, mergeBackup };
