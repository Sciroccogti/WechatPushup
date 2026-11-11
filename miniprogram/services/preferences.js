const { DEFAULT_OPTICAL, isValidOptical } = require('../config/optical');
const { DEFAULT_GYRO, GYRO_EXERCISES, isValidGyro, pickGyro } = require('../config/gyro');
const { EXERCISES } = require('../config/exercises');
const { LocalDocument } = require('./storage/local-document');
const KEY = 'fitness.preferences.v1';
const ids = EXERCISES.map((item) => item.id);
const pickOptical = (value) => Object.keys(DEFAULT_OPTICAL).reduce((result, key) => { result[key] = value[key]; return result; }, {});
const fresh = () => ({ schemaVersion: 3, optical: { ...DEFAULT_OPTICAL }, gyro: { 'sit-up': { ...DEFAULT_GYRO }, squat: { ...DEFAULT_GYRO } }, recentExerciseIds: [], usageMs: {}, sortMode: 'duration' });
function parse(value) {
  if (!value || ![1, 2, 3].includes(value.schemaVersion) || !isValidOptical(value.optical) || !Array.isArray(value.recentExerciseIds) || value.recentExerciseIds.some((id) => typeof id !== 'string')) throw new Error('INVALID_PREFERENCES');
  const next = fresh(); next.optical = pickOptical(value.optical);
  next.recentExerciseIds = [...new Set(value.recentExerciseIds)].filter((id) => ids.includes(id));
  if (value.schemaVersion >= 2) {
    if (!['recent', 'duration'].includes(value.sortMode) || !value.usageMs || typeof value.usageMs !== 'object' || Array.isArray(value.usageMs)) throw new Error('INVALID_PREFERENCES');
    next.sortMode = value.sortMode;
    for (const id of ids) {
      const time = value.usageMs[id] === undefined ? 0 : value.usageMs[id];
      if (!Number.isSafeInteger(time) || time < 0) throw new Error('INVALID_USAGE');
      next.usageMs[id] = time;
    }
  }
  if (value.schemaVersion === 3) {
    if (!value.gyro || !GYRO_EXERCISES.every((id) => isValidGyro(value.gyro[id]))) throw new Error('INVALID_GYRO_SETTINGS');
    for (const id of GYRO_EXERCISES) next.gyro[id] = pickGyro(value.gyro[id]);
  }
  return next;
}
class PreferencesStore {
  constructor(api) { this.document = new LocalDocument(api, KEY, fresh, parse); }
  get value() { return this.document.value; }
  get warning() { return this.document.warning; }
  get locked() { return this.document.locked; }
  load() { return this.document.load(); }
  saveOptical(settings) {
    if (!isValidOptical(settings)) throw new Error('INVALID_OPTICAL_SETTINGS');
    return this.document.update((value) => { value.optical = pickOptical(settings); });
  }
  saveGyro(id, settings) {
    if (!GYRO_EXERCISES.includes(id) || !isValidGyro(settings)) throw new Error('INVALID_GYRO_SETTINGS');
    return this.document.update((value) => { value.gyro[id] = pickGyro(settings); });
  }
  markUsed(id) {
    if (!ids.includes(id)) return false;
    return this.document.update((value) => { value.recentExerciseIds = [id, ...value.recentExerciseIds.filter((item) => item !== id)]; });
  }
  addUsage(id, delta) {
    if (!ids.includes(id) || !Number.isSafeInteger(delta) || delta <= 0) return false;
    return this.document.update((value) => { value.usageMs[id] = Math.min(Number.MAX_SAFE_INTEGER, (value.usageMs[id] || 0) + delta); });
  }
  setSortMode(mode) {
    if (!['recent', 'duration'].includes(mode)) return false;
    return this.document.update((value) => { value.sortMode = mode; });
  }
}
module.exports = { PreferencesStore, PREFERENCES_KEY: KEY };
