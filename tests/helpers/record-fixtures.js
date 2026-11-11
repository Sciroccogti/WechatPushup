const { normalizeResult, freshRecords } = require('../../miniprogram/domain/records/document');
function result(id, date = '2026-11-12', options = {}) {
  const at = new Date(date + 'T12:00:00').getTime();
  const group = { target: null, actual: 10, workMs: 60000, restMs: 0, status: 'completed' };
  const value = { id, exerciseId: 'push-up', purpose: 'free', fatigue: 3, activeMs: 60000, startedAt: at, endedAt: at + 60000,
    groups: [group], modes: ['touch'], actual: 10, planned: 0, completion: null, aborted: false, ...options };
  return normalizeResult(value);
}
function document(records) { const doc = freshRecords(); for (const r of records) { doc.results[r.id] = r; doc.savedOrder.push(r.id); } return doc; }
module.exports = { result, document };
