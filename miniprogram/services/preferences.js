const { DEFAULT_OPTICAL, isValidOptical } = require('../config/optical');
const { EXERCISES } = require('../config/exercises');
const KEY = 'fitness.preferences.v1';
const copy = (value) => JSON.parse(JSON.stringify(value));
const pickOptical = (value) => Object.keys(DEFAULT_OPTICAL).reduce((result, key) => { result[key] = value[key]; return result; }, {});
const fresh = () => ({ schemaVersion: 1, optical: Object.assign({}, DEFAULT_OPTICAL), recentExerciseIds: [] });

class PreferencesStore {
  constructor(api) { this.api = api; this.value = fresh(); this.warning = ''; this.locked = false; }
  load() {
    this.warning = '';
    this.locked = false;
    try {
      const stored = this.api.getStorageSync(KEY);
      if (stored === '' || stored === undefined) this.value = fresh();
      else if (!stored || stored.schemaVersion !== 1 || !isValidOptical(stored.optical) || !Array.isArray(stored.recentExerciseIds) ||
        stored.recentExerciseIds.some((id) => typeof id !== 'string')) {
        this.locked = true;
        this.warning = '本地配置版本或内容无法识别，暂用默认值；不会覆盖原数据。';
        this.value = fresh();
      } else {
        this.value = { schemaVersion: 1, optical: pickOptical(stored.optical), recentExerciseIds: [...new Set(stored.recentExerciseIds)].filter((id) => EXERCISES.some((e) => e.id === id)) };
      }
    } catch (_) {
      this.locked = true;
      this.warning = '读取本地配置失败，当前修改仅在此页面临时生效。';
    }
    return copy(this.value);
  }
  _save() {
    if (this.locked) return false;
    try { this.api.setStorageSync(KEY, copy(this.value)); this.warning = ''; return true; }
    catch (_) { this.warning = '保存失败，当前修改仅在此页面临时生效，请检查本地存储。'; return false; }
  }
  saveOptical(settings) {
    if (!isValidOptical(settings)) throw new Error('INVALID_OPTICAL_SETTINGS');
    this.value.optical = pickOptical(settings);
    return this._save();
  }
  markUsed(id) {
    if (!EXERCISES.some((item) => item.id === id)) return false;
    this.value.recentExerciseIds = [id, ...this.value.recentExerciseIds.filter((item) => item !== id)];
    return this._save();
  }
}

module.exports = { PreferencesStore, PREFERENCES_KEY: KEY };
