const { LocalDocument } = require('./storage/local-document');
const { getExerciseById } = require('../config/exercises');
const { assess, generatePlan, adjustProgress } = require('../domain/training/plan');
const { POLICY } = require('../config/training-policy');
const KEY = 'fitness.training.v1';
const fresh = () => ({ schemaVersion: 1, profiles: {}, results: {}, savedOrder: [] });
function validResult(result) {
  const exercise = result && getExerciseById(result.exerciseId);
  if (!exercise || typeof result.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(result.id) || !['plan', 'free', 'assessment'].includes(result.purpose) ||
      !Number.isInteger(result.fatigue) || result.fatigue < 1 || result.fatigue > 5 || !Number.isFinite(result.activeMs) || result.activeMs < 0 ||
      !Number.isFinite(result.startedAt) || !Number.isFinite(result.endedAt) || result.endedAt < result.startedAt ||
      !Array.isArray(result.groups) || result.groups.length !== (result.purpose === 'plan' ? 5 : 1) || !Array.isArray(result.modes) ||
      result.modes.some((mode) => !['touch', 'optical', 'gyro', 'timer', 'manual'].includes(mode))) return false;
  const maxTarget = exercise.measurement === 'duration' ? POLICY.maxSeconds : POLICY.maxRepetitions;
  if (result.groups.some((group) => !group || !Number.isSafeInteger(group.actual) || group.actual < 0 ||
      !(group.target === null || (Number.isInteger(group.target) && group.target > 0 && group.target <= maxTarget)) ||
      !['pending', 'completed', 'skipped'].includes(group.status) ||
      !Number.isFinite(group.workMs) || group.workMs < 0 || !Number.isFinite(group.restMs) || group.restMs < 0)) return false;
  const actual = result.groups.reduce((sum, group) => sum + group.actual, 0);
  const planned = result.groups.reduce((sum, group) => sum + (group.target || 0), 0);
  return result.actual === actual && result.planned === planned && result.completion === (planned ? actual / planned : null) &&
    (result.purpose !== 'assessment' || (actual > 0 && actual <= maxTarget));
}
function parse(value) {
  if (!value || value.schemaVersion !== 1 || !value.profiles || typeof value.profiles !== 'object' || Array.isArray(value.profiles) || !value.results || typeof value.results !== 'object' || Array.isArray(value.results) || !Array.isArray(value.savedOrder)) throw new Error('INVALID_TRAINING_DATA');
  for (const [id, profile] of Object.entries(value.profiles)) {
    const exercise = getExerciseById(id);
    if (!exercise || profile.exerciseId !== id || !Number.isInteger(profile.maximum) || profile.maximum < 1 ||
        profile.maximum > (exercise.measurement === 'duration' ? POLICY.maxSeconds : POLICY.maxRepetitions) ||
        !Number.isFinite(profile.level) || profile.level < POLICY.minLevel || profile.level > POLICY.maxLevel ||
        !Number.isFinite(profile.assessedAt) || !Number.isFinite(profile.nextTrainAt) ||
        !(profile.lastTrainAt === null || Number.isFinite(profile.lastTrainAt)) ||
        !Number.isInteger(profile.completedSessions) || profile.completedSessions < 0 || !Number.isInteger(profile.sinceAssessment) || profile.sinceAssessment < 0 ||
        !Array.isArray(profile.recent) || profile.recent.some((item) => !item || !Number.isFinite(item.completion) || item.completion < 0 || item.completion > 1 ||
          !Number.isInteger(item.fatigue) || item.fatigue < 1 || item.fatigue > 5 || !Number.isFinite(item.at) || typeof item.complete !== 'boolean')) throw new Error('INVALID_PROFILE');
  }
  if (new Set(value.savedOrder).size !== value.savedOrder.length ||
      value.savedOrder.some((id) => typeof id !== 'string' || !value.results[id]) ||
      Object.entries(value.results).some(([id, result]) => !validResult(result) || result.id !== id || !value.savedOrder.includes(id))) throw new Error('INVALID_RESULTS');
  return value;
}
class TrainingStore {
  constructor(api) { this.document = new LocalDocument(api, KEY, fresh, parse); this.document.load(); }
  get warning() { return this.document.warning; }
  profile(id) { this.document.load(); return this.document.value.profiles[id] || null; }
  plan(id, at) { return generatePlan(getExerciseById(id), this.profile(id), at); }
  saveAssessment(id, maximum, at) {
    return this.document.update((value) => { value.profiles[id] = assess(getExerciseById(id), maximum, at, value.profiles[id]); });
  }
  finish(result) {
    if (!validResult(result)) throw new Error('INVALID_RESULT');
    return this.document.update((value) => {
      if (value.results[result.id]) return; // 同一结果重试不能重复推进计划。
      if (result.purpose === 'plan') value.profiles[result.exerciseId] = adjustProgress(value.profiles[result.exerciseId], result);
      if (result.purpose === 'assessment' && !result.aborted && result.actual > 0) {
        value.profiles[result.exerciseId] = assess(getExerciseById(result.exerciseId), result.actual, result.endedAt, value.profiles[result.exerciseId]);
        value.profiles[result.exerciseId].nextTrainAt = result.endedAt + POLICY.recoveryMs;
        value.profiles[result.exerciseId].lastTrainAt = result.endedAt;
        value.profiles[result.exerciseId].reason = '能力测试已完成，先恢复再进行计划训练。';
      }
      value.results[result.id] = result; value.savedOrder.push(result.id);
      // 不按数量自动删除训练结果；历史界面/分块/导出在阶段6扩展。
    });
  }
  result(id) { this.document.load(); return this.document.value.results[id] || null; }
}
module.exports = { TrainingStore, TRAINING_KEY: KEY };
