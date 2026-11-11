const { getExerciseById } = require('../../config/exercises');
const { POLICY } = require('../../config/training-policy');
const { dayKey, validDay } = require('./dates');
const clone = (value) => JSON.parse(JSON.stringify(value));
const isMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const validId = (v) => typeof v === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(v) && !Object.getOwnPropertyNames(Object.prototype).includes(v) && v !== 'prototype';
const validAt = (v) => Number.isFinite(v) && Math.abs(v) <= 8640000000000000;
function validResult(result) {
  const exercise = result && getExerciseById(result.exerciseId);
  if (!exercise || !validId(result.id) || !['plan', 'free', 'assessment'].includes(result.purpose) ||
      !Number.isInteger(result.fatigue) || result.fatigue < 1 || result.fatigue > 5 || !Number.isFinite(result.activeMs) || result.activeMs < 0 ||
      !validAt(result.startedAt) || !validAt(result.endedAt) || result.endedAt < result.startedAt ||
      !Array.isArray(result.groups) || result.groups.length !== (result.purpose === 'plan' ? 5 : 1) || !Array.isArray(result.modes) || result.modes.length > 6 ||
      (typeof result.policyVersion === 'string' && result.policyVersion.length > 100) ||
      result.modes.some((mode) => !['touch', 'optical', 'gyro', 'motion', 'timer', 'manual'].includes(mode))) return false;
  const maxTarget = exercise.measurement === 'duration' ? POLICY.maxSeconds : POLICY.maxRepetitions;
  if (result.groups.some((group) => !group || !Number.isSafeInteger(group.actual) || group.actual < 0 ||
      !(group.target === null || (Number.isInteger(group.target) && group.target > 0 && group.target <= maxTarget)) ||
      !['pending', 'completed', 'skipped'].includes(group.status) ||
      !Number.isFinite(group.workMs) || group.workMs < 0 || !Number.isFinite(group.restMs) || group.restMs < 0)) return false;
  const actual = result.groups.reduce((sum, group) => sum + group.actual, 0);
  const planned = result.groups.reduce((sum, group) => sum + (group.target || 0), 0);
  return Number.isSafeInteger(actual) && result.actual === actual && result.planned === planned && result.completion === (planned ? actual / planned : null) &&
    (result.purpose !== 'assessment' || (actual > 0 && actual <= maxTarget));
}

function normalizeResult(result) {
  if (!validResult(result) || (result.revision !== undefined && (!Number.isSafeInteger(result.revision) || result.revision < 1)) ||
      (result.localDate !== undefined && !validDay(result.localDate)) || (result.updatedAt !== undefined && !validAt(result.updatedAt))) throw new Error('INVALID_RESULT');
  return { id: result.id, exerciseId: result.exerciseId, purpose: result.purpose, startedAt: result.startedAt, endedAt: result.endedAt,
    localDate: result.localDate || dayKey(result.startedAt), updatedAt: result.updatedAt === undefined ? result.endedAt : result.updatedAt, revision: result.revision || 1,
    actual: result.actual, planned: result.planned, completion: result.completion, activeMs: result.activeMs,
    fatigue: result.fatigue, aborted: !!result.aborted, deload: !!result.deload,
    policyVersion: typeof result.policyVersion === 'string' || Number.isFinite(result.policyVersion) ? result.policyVersion : null,
    modes: [...new Set(result.modes)], groups: result.groups.map((g) => ({ target: g.target, plannedTarget: Number.isSafeInteger(g.plannedTarget) && g.plannedTarget > 0 ? g.plannedTarget : g.target,
      actual: g.actual, status: g.status, workMs: g.workMs, restMs: g.restMs })) };
}
function freshRecords() { return { schemaVersion: 2, profiles: {}, results: {}, savedOrder: [], tombstones: {}, assessments: {} }; }
function normalizeDocument(input) {
  if (!input || ![1, 2].includes(input.schemaVersion)) throw new Error('UNSUPPORTED_TRAINING_VERSION');
  // 沿用已验证的阶段5资料/结果约束，再挑选可持久化字段。
  parseLegacy({ ...input, schemaVersion: 1 });
  const next = freshRecords();
  for (const [id, p] of Object.entries(input.profiles)) next.profiles[id] = {
    exerciseId: p.exerciseId, maximum: p.maximum, assessedAt: p.assessedAt, level: p.level, nextTrainAt: p.nextTrainAt, lastTrainAt: p.lastTrainAt,
    completedSessions: p.completedSessions, sinceAssessment: p.sinceAssessment, progressionStreak: Number.isSafeInteger(p.progressionStreak) && p.progressionStreak >= 0 ? p.progressionStreak : 0,
    recent: p.recent.map((r) => ({ id: validId(r.id) ? r.id : 'legacy', at: r.at, completion: r.completion, fatigue: r.fatigue, complete: r.complete })),
    reason: typeof p.reason === 'string' ? p.reason.slice(0, 500) : '' };
  next.savedOrder = [...input.savedOrder];
  for (const id of next.savedOrder) next.results[id] = normalizeResult(input.results[id]);
  if (input.schemaVersion === 2) {
    if (!isMap(input.tombstones) || !isMap(input.assessments)) throw new Error('INVALID_RECORD_METADATA');
    for (const [id, t] of Object.entries(input.tombstones)) {
      if (!validId(id) || !t || !validAt(t.deletedAt) || !Number.isSafeInteger(t.revision) || t.revision < 1 || next.results[id]) throw new Error('INVALID_TOMBSTONE');
      next.tombstones[id] = { deletedAt: t.deletedAt, revision: t.revision };
    }
    for (const [id, a] of Object.entries(input.assessments)) {
      const e = a && getExerciseById(a.exerciseId);
      if (!validId(id) || !e || !validAt(a.at) || !validDay(a.localDate) || !Number.isInteger(a.maximum) || a.maximum < 1 || a.maximum > (e.measurement === 'duration' ? POLICY.maxSeconds : POLICY.maxRepetitions) || !['manual', 'legacy'].includes(a.source)) throw new Error('INVALID_ASSESSMENT_EVENT');
      next.assessments[id] = { exerciseId: a.exerciseId, at: a.at, localDate: a.localDate, maximum: a.maximum, source: a.source };
    }
  } else {
    for (const p of Object.values(next.profiles)) {
      if (Object.values(next.results).some((r) => r.exerciseId === p.exerciseId && r.purpose === 'assessment' && !r.aborted && r.endedAt === p.assessedAt && r.actual === p.maximum)) continue;
      next.assessments['legacy-' + p.exerciseId + '-' + Math.abs(p.assessedAt)] = { exerciseId: p.exerciseId, at: p.assessedAt, localDate: dayKey(p.assessedAt), maximum: p.maximum, source: 'legacy' };
    }
  }
  return clone(next);
}
function parseLegacy(value) {
  if (!value || value.schemaVersion !== 1 || !value.profiles || typeof value.profiles !== 'object' || Array.isArray(value.profiles) || !value.results || typeof value.results !== 'object' || Array.isArray(value.results) || !Array.isArray(value.savedOrder)) throw new Error('INVALID_TRAINING_DATA');
  for (const [id, profile] of Object.entries(value.profiles)) {
    const exercise = getExerciseById(id);
    if (!exercise || !profile || profile.exerciseId !== id || !Number.isInteger(profile.maximum) || profile.maximum < 1 ||
        profile.maximum > (exercise.measurement === 'duration' ? POLICY.maxSeconds : POLICY.maxRepetitions) ||
        !Number.isFinite(profile.level) || profile.level < POLICY.minLevel || profile.level > POLICY.maxLevel ||
        !validAt(profile.assessedAt) || !validAt(profile.nextTrainAt) ||
        !(profile.lastTrainAt === null || validAt(profile.lastTrainAt)) ||
        !Number.isInteger(profile.completedSessions) || profile.completedSessions < 0 || !Number.isInteger(profile.sinceAssessment) || profile.sinceAssessment < 0 ||
        !Array.isArray(profile.recent) || profile.recent.some((item) => !item || !Number.isFinite(item.completion) || item.completion < 0 || item.completion > 1 ||
          !Number.isInteger(item.fatigue) || item.fatigue < 1 || item.fatigue > 5 || !validAt(item.at) || typeof item.complete !== 'boolean')) throw new Error('INVALID_PROFILE');
  }
  if (new Set(value.savedOrder).size !== value.savedOrder.length ||
      value.savedOrder.some((id) => typeof id !== 'string' || !value.results[id]) ||
      Object.entries(value.results).some(([id, result]) => !validResult(result) || result.id !== id || !value.savedOrder.includes(id))) throw new Error('INVALID_RESULTS');
  return value;
}

module.exports = { validResult, parseLegacy, normalizeResult, normalizeDocument, freshRecords, validId };
