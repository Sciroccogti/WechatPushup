const { RecordDocument } = require('./storage/record-document');
const { validResult, normalizeResult, validId } = require('../domain/records/document');
const { getExerciseById } = require('../config/exercises');
const { assess, generatePlan, adjustProgress } = require('../domain/training/plan');
const { POLICY } = require('../config/training-policy');
const { dayKey } = require('../domain/records/dates');
const { encodeBackup, decodeBackup, mergeBackup } = require('../domain/records/backup');
const KEY = 'fitness.training.v1';
class TrainingStore {
  constructor(api) { this.document = new RecordDocument(api, KEY); this.document.load(); }
  get warning() { return this.document.warning; }
  get locked() { return this.document.locked; }
  snapshot() { return this.document.load(); }
  profile(id) { this.document.load(); return this.document.value.profiles[id] || null; }
  plan(id, at) { return generatePlan(getExerciseById(id), this.profile(id), at); }
  saveAssessment(id, maximum, at) {
    return this.document.update((value) => {
      value.profiles[id] = assess(getExerciseById(id), maximum, at, value.profiles[id]);
      const eventId = 'assessment-' + id + '-' + Math.abs(at);
      value.assessments[eventId] = { exerciseId: id, maximum, at, localDate: dayKey(at), source: 'manual' };
    });
  }
  finish(result) {
    if (!validResult(result)) throw new Error('INVALID_RESULT');
    return this.document.update((value) => {
      if (value.results[result.id] || value.tombstones[result.id]) return; // 保存重试不推进计划，也不能复活已删除记录。
      if (result.purpose === 'plan') value.profiles[result.exerciseId] = adjustProgress(value.profiles[result.exerciseId], result);
      if (result.purpose === 'assessment' && !result.aborted && result.actual > 0) {
        value.profiles[result.exerciseId] = assess(getExerciseById(result.exerciseId), result.actual, result.endedAt, value.profiles[result.exerciseId]);
        value.profiles[result.exerciseId].nextTrainAt = result.endedAt + POLICY.recoveryMs;
        value.profiles[result.exerciseId].lastTrainAt = result.endedAt;
        value.profiles[result.exerciseId].reason = '能力测试已完成，先恢复再进行计划训练。';
      }
      value.results[result.id] = normalizeResult(result); value.savedOrder.push(result.id);
    });
  }
  result(id) { this.document.load(); return validId(id) ? this.document.value.results[id] || null : null; }
  removeResult(id, at) {
    return this.document.update((value) => {
      const result = value.results[id]; if (!result) return;
      value.tombstones[id] = { deletedAt: at, revision: result.revision + 1 };
      delete value.results[id]; value.savedOrder = value.savedOrder.filter((item) => item !== id);
    });
  }
  exportBackup(at) { const value = this.snapshot(); if (this.locked) throw new Error(this.warning); return encodeBackup(value, at); }
  previewImport(text) { const incoming = decodeBackup(text); const local = this.snapshot(); if (this.locked) throw new Error(this.warning); return mergeBackup(local, incoming).report; }
  importBackup(text) {
    const incoming = decodeBackup(text); let report;
    const saved = this.document.update((value) => { const merged = mergeBackup(value, incoming); report = merged.report; Object.assign(value, merged.document); });
    return { saved, report };
  }
}
module.exports = { TrainingStore, TRAINING_KEY: KEY };
