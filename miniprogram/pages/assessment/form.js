const { getExerciseViewById } = require('../../utils/exercise-view');
const { TrainingStore } = require('../../services/training-store');
module.exports = {
  data: { exercise: null, value: '', message: '', testUrl: '' },
  onLoad(options) {
    const exercise = getExerciseViewById(options && options.exerciseId);
    this._store = new TrainingStore(wx);
    const profile = exercise ? this._store.profile(exercise.id) : null;
    this.setData({ exercise, value: profile ? String(profile.maximum) : '', message: this._store.warning,
      testUrl: exercise ? '/pages/training/index?purpose=assessment&exerciseId=' + exercise.id : '' });
  },
  onValueInput(event) { this.setData({ value: event.detail.value }); },
  saveAssessment() {
    if (!this.data.exercise) return;
    try {
      if (!this._store.saveAssessment(this.data.exercise.id, Number(this.data.value), Date.now())) return this.setData({ message: this._store.warning });
      wx.redirectTo({ url: '/pages/plan/index?exerciseId=' + this.data.exercise.id, fail: () => this.setData({ message: '能力值已保存，可返回计划页查看。' }) });
    } catch (_) { this.setData({ message: '请输入有效的最大次数（1–1000）或秒数（1–3600）。' }); }
  }
};
