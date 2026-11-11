const { getSession } = require('../../services/session-runtime');
const { TrainingStore } = require('../../services/training-store');
const { getExerciseViewById } = require('../../utils/exercise-view');
const { durationLabel, dateLabel } = require('../../utils/time');
module.exports = {
  data: { result: null, exercise: null, fatigueIndex: 2, fatigueOptions: ['1 轻松', '2 尚可', '3 适中', '4 较累', '5 很累'], saved: false, message: '', elapsed: '', nextReasons: [], nextTime: '', completionLabel: '—' },
  onLoad(options) {
    this._store = new TrainingStore(wx);
    this._session = getSession(options && options.sessionId);
    const stored = options && options.sessionId ? this._store.result(options.sessionId) : null;
    const result = stored || (this._session && this._session.state === 'finished' ? this._session.result(3) : null);
    this.setData({ result, saved: !!stored, fatigueIndex: result ? result.fatigue - 1 : 2, exercise: result ? getExerciseViewById(result.exerciseId) : null,
      elapsed: result ? durationLabel(result.activeMs) : '', completionLabel: result && result.completion !== null ? Math.round(result.completion * 100) + '%' : '自由训练', message: this._store.warning });
  },
  onFatigueChange(event) { if (!this.data.saved) this.setData({ fatigueIndex: Number(event.detail.value) }); },
  onHide() { this._save(true); },
  onUnload() { this._save(false); },
  saveResult() { this._save(true); },
  _save(render) {
    if (!this.data.result || this.data.saved) return;
    const result = Object.assign({}, this.data.result, { fatigue: this.data.fatigueIndex + 1 });
    try {
      if (!this._store.finish(result)) { if (render) this.setData({ message: this._store.warning }); return; }
      if (!render) { this.data.saved = true; return; }
      const plan = this._store.plan(result.exerciseId, Date.now());
      this.setData({ saved: true, result, nextReasons: plan.reasons, nextTime: plan.nextTrainAt ? dateLabel(plan.nextTrainAt) : '', message: '已保存训练记录并更新个人计划。' });
    } catch (_) { if (render) this.setData({ message: '结果无法保存；能力测试需得到大于0的有效次数或秒数。' }); }
  },
  correctLastCount() {
    if (!this._session || this.data.saved || this.data.exercise.isTimed) return;
    const group = this._session.groups[this._session.groups.length - 1];
    group.actual = Math.max(0, group.actual - 1);
    const result = this._session.result(this.data.fatigueIndex + 1);
    this.setData({ result, completionLabel: result.completion === null ? '自由训练' : Math.round(result.completion * 100) + '%' });
  }
};
