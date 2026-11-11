const { TrainingStore } = require('../../services/training-store');
const { EXERCISES } = require('../../config/exercises');
const { statistics } = require('../../domain/records/query');
module.exports = {
  data: { exerciseOptions: EXERCISES.map((e) => e.name), exerciseIndex: 0, periodOptions: ['本周', '本月', '全部'], periodIndex: 1, stats: null, warning: '' },
  onLoad() { this._store = new TrainingStore(wx); },
  onShow() { this._refresh(); },
  _refresh() { const doc = this._store.snapshot(); this.setData({ stats: statistics(doc, EXERCISES[this.data.exerciseIndex].id, ['week', 'month', 'all'][this.data.periodIndex], Date.now()), warning: this._store.warning }); },
  onExerciseChange(event) { const value = Number(event.detail.value); if (Number.isInteger(value) && value >= 0 && value < EXERCISES.length) { this.setData({ exerciseIndex: value }); this._refresh(); } },
  onPeriodChange(event) { const value = Number(event.detail.value); if (Number.isInteger(value) && value >= 0 && value < 3) { this.setData({ periodIndex: value }); this._refresh(); } }
};
