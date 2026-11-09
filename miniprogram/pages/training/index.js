const { getExerciseViewById } = require('../../utils/exercise-view');
const { CounterManager } = require('../../domain/counter/manager');
const { withOpticalPage } = require('../../services/optical-page');

Page(withOpticalPage({
  data: { exercise: null, count: 0, selectedMode: 'touch', phase: 'idle', notice: '' },

  onLoad(options) {
    const exercise = getExerciseViewById(options && options.exerciseId);
    this._counter = new CounterManager();
    this._opticalAllowed = !!exercise && !exercise.isTimed;
    this.setData({ exercise });
    if (exercise) {
      this._prefs.markUsed(exercise.id);
      this.setData({ storageMessage: this._prefs.warning });
    }
  },
  onHide() {
    if (this.data.phase === 'running' || this.data.phase === 'calibrating') {
      this._counter.pause();
      this.setData({ phase: 'paused', notice: '已暂停。返回后请主动继续；光学模式会重新校准。' });
    }
  },
  onUnload() { this._counter.stop(); },
  onOpticalStarting() {
    this._counter.pause();
    this.setData({ selectedMode: 'optical', phase: 'calibrating', notice: '' });
  },
  onOpticalStarted() {
    this._counter.minIntervalMs = 0; // 光学时序由状态机与用户冷却参数管理。
    this._counter.start('optical');
    this.setData({ phase: 'running' });
  },
  onOpticalCount(at) { if (this._counter.addCount('optical', at)) this._countChanged(true); },
  onOpticalFault(message) {
    this._counter.minIntervalMs = 600;
    this._counter.start('touch');
    this.setData({ selectedMode: 'touch', phase: 'running', notice: message + ' 已切换触屏，次数保留。' });
  },
  onOpticalStopped() { this._counter.pause(); this.setData({ phase: 'paused' }); },
  selectTouch() {
    const active = this.data.phase === 'running' || this.data.phase === 'calibrating';
    this._releaseOptical(false);
    this._counter.minIntervalMs = 600;
    if (active) this._counter.start('touch');
    this.setData({ selectedMode: 'touch', phase: active ? 'running' : this.data.phase, notice: '' });
  },
  startCounting() {
    if (!this._opticalAllowed) return;
    if (this.data.selectedMode === 'optical') return this.startOptical();
    this._counter.minIntervalMs = 600;
    this._counter.start('touch');
    this.setData({ phase: 'running', notice: '' });
  },
  pauseCounting() {
    this._releaseOptical(false);
    this._counter.pause();
    this.setData({ phase: 'paused' });
  },
  endCounting() {
    this._releaseOptical(false);
    this._counter.stop();
    this.setData({ phase: 'ended', notice: '本次计数已结束，次数保留在当前页面；训练记录保存将在后续开放。' });
  },
  onTouchStart(event) {
    const contacts = event.touches ? event.touches.length : 0;
    if (this._counter.touchStart(Date.now(), contacts)) this._countChanged(true);
  },
  onTouchEnd(event) { this._counter.touchEnd(event.touches ? event.touches.length : 0); },
  preventTouchMove() {},
  manualAdd() { if (this._counter.addCount('manual', Date.now())) this._countChanged(false); },
  undoCount() { this._counter.undoCount(); this._countChanged(false); },
  resetCount() {
    const active = this._counter.running;
    const source = this._counter.source;
    this._counter.reset();
    if (active && source) this._counter.start(source);
    this.recalibrateOptical();
    this._countChanged(false);
  },
  _countChanged(feedback) {
    this.setData({ count: this._counter.getCount() });
    if (feedback && typeof wx.vibrateShort === 'function') wx.vibrateShort({ fail() {} });
  }
}));
