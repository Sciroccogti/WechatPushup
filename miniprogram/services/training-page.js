const { getExerciseViewById } = require('../utils/exercise-view');
const { durationLabel } = require('../utils/time');
const { CounterManager } = require('../domain/counter/manager');
const { TrainingStore } = require('./training-store');
const { beginSession, getSession, clearSession } = require('./session-runtime');
const { GyroSource } = require('./gyro-source');
const { withOpticalPage } = require('./optical-page');

function createTrainingPage(surface) {
  return withOpticalPage({
    data: { exercise: null, count: 0, total: 0, selectedMode: 'touch', phase: 'idle', notice: '', blockedMessage: '',
      purpose: 'free', groupNumber: 1, groupCount: 1, target: '—', targetDraft: '', restSeconds: 0,
      elapsed: '0秒', groupRows: [], gyroAxisIndex: 0, gyroAxes: ['胸前竖向（X轴）', '自动选轴'], gyro: { state: 'IDLE', x: '—', y: '—', z: '—', angle: '—' } },
    onLoad(options) {
      const params = options || {};
      const exercise = getExerciseViewById(params.exerciseId);
      this._counter = new CounterManager(); this._trainingStore = new TrainingStore(wx);
      this._gyro = new GyroSource(wx, {
        signal: (signal) => {
          if (!this._visible) return;
          const at = Date.now();
          if (signal.state === 'READY' && this.data.phase === 'calibrating') this._startWork('gyro');
          if (signal.state === 'CALIBRATING' && this._session && this._session.state === 'working') this._pauseForCalibration('gyro');
          if (!this._gyroRenderAt || at - this._gyroRenderAt >= 200 || signal.counted) {
            this._gyroRenderAt = at;
            this.setData({ gyro: { state: signal.state, x: signal.rates.x.toFixed(2), y: signal.rates.y.toFixed(2), z: signal.rates.z.toFixed(2), angle: signal.angle.toFixed(2) } });
          }
        },
        count: (at) => this._acceptCount('gyro', at), fault: (message) => this._fallbackTouch(message)
      });
      this.setData({ exercise });
      this._opticalAllowed = !!exercise && exercise.sensor === 'optical';
      if (!exercise) return;
      this._prefs.markUsed(exercise.id);
      const initialMode = exercise.isTimed ? 'timer' : params.mode === exercise.sensor ? params.mode : 'touch';
      this.setData({ storageMessage: this._prefs.warning || this._trainingStore.warning, selectedMode: initialMode });
      if (params.sessionId) {
        const session = getSession(params.sessionId);
        if (!session || session.exerciseId !== exercise.id) return this.setData({ blockedMessage: '这次训练已结束或页面已重启，请重新进入计划。' });
        this._session = session;
        this.setData({ selectedMode: session.lastMode || (exercise.isTimed ? 'timer' : 'touch'), gyroAxisIndex: session.gyroAxisIndex || 0 });
      } else {
        const purpose = ['plan', 'assessment'].includes(params.purpose) ? params.purpose : 'free';
        const plan = purpose === 'plan' ? this._trainingStore.plan(exercise.id, Date.now()) : null;
        if (plan && (plan.needsAssessment || plan.recovery)) return this.setData({ blockedMessage: plan.needsAssessment ? '请先完成能力评估。' : '当前处于恢复期，请查看下一训练时间。' });
        try { this._session = beginSession(exercise, purpose, plan, Date.now()); }
        catch (_) { return this.setData({ blockedMessage: '已有训练未结束，请返回原训练或结束后再开始。' }); }
      }
      this._autoStart = params.autostart === '1' && this._session.state === 'ready';
      this._syncSession();
    },
    onShow() {
      if (!this._session) return;
      this._syncSession(); this._startTicker();
      if (this._autoStart) { this._autoStart = false; this.startCounting(); }
    },
    onHide() {
      this._stopTicker();
      if (this._session) { if (!this._transfer) this._session.pause(Date.now()); this._stopSensors(); this._flushUsage(true); if (!this._transfer) this._syncSession(); }
    },
    onUnload() {
      this._stopTicker(); this._stopSensors();
      if (this._session) {
        if (!this._transfer && this._session.state !== 'finished') {
          this._session.finish(Date.now(), true);
          if (this._session.activeMs > 0 || this._session.groups.some((group) => group.actual > 0)) {
            if (!this._trainingStore.finish(this._session.result(3))) wx.showToast({ title: '训练结果未能保存，请检查本地存储', icon: 'none' });
          }
          clearSession(this._session.id);
        }
        this._flushUsage(true);
      }
    },
    _startTicker() {
      this._stopTicker();
      this._ticker = setInterval(() => {
        if (!this._visible || !this._session) return;
        this._session.tick(Date.now()); this._flushUsage(false); this._syncSession();
      }, 250);
    },
    _stopTicker() { clearInterval(this._ticker); this._ticker = null; },
    _flushUsage(force) {
      if (!this._session) return;
      const now = Date.now();
      const delta = Math.floor(this._session.activeMs - this._session.usageSavedMs);
      if (delta <= 0 || (!force && (delta < 5000 || now - (this._lastUsageAttempt || 0) < 5000))) return;
      this._lastUsageAttempt = now;
      if (this._prefs.addUsage(this._session.exerciseId, delta)) this._session.usageSavedMs += delta;
      if (this._visible) this.setData({ storageMessage: this._prefs.warning });
    },
    _stopSensors() {
      this._preparingSensor = false;
      this._releaseOptical(!this._visible);
      if (this._gyro) this._gyro.stop();
      this._counter.pause();
    },
    _syncSession() {
      const session = this._session;
      if (!session) return;
      const phase = this._preparingSensor ? 'calibrating' : session.state === 'working' ? 'running' : session.state;
      this.setData({ phase, purpose: session.purpose, count: session.current().actual,
        total: session.groups.reduce((sum, group) => sum + group.actual, 0), groupNumber: session.index + 1, groupCount: session.groups.length,
        target: session.current().target === null ? '—' : session.current().target, elapsed: durationLabel(session.activeMs),
        restSeconds: session.state === 'rest' ? Math.max(0, Math.ceil((session.restUntil - Date.now()) / 1000)) : session.state === 'paused' && session.pausedFrom === 'rest' ? Math.ceil(session.remainingRest / 1000) : 0,
        groupRows: session.groups.map((group, index) => ({ number: index + 1, target: group.target === null ? '—' : group.target, actual: group.actual, status: group.status === 'completed' ? '完成' : group.status === 'skipped' ? '跳过' : '待完成' })) });
      if (['rest', 'ready', 'finished'].includes(session.state) && !this._preparingSensor) {
        if (session.state === 'ready' && this._lastSessionState === 'rest' && typeof wx.vibrateShort === 'function') wx.vibrateShort({ fail() {} });
        if (this._lastSessionState !== session.state) { this._stopSensors(); this._flushUsage(true); }
        if (session.state === 'finished') this._route('summary', false);
        else if (surface !== 'rest' && !this._autoStart) this._route('rest', false);
      }
      this._lastSessionState = session.state;
    },
    _route(page, autostart) {
      if (this._transfer || !this._visible) return;
      this._transfer = true; this._stopTicker();
      const url = '/pages/' + page + '/index?exerciseId=' + this._session.exerciseId + '&sessionId=' + this._session.id + (autostart ? '&autostart=1' : '');
      wx.redirectTo({ url, fail: () => { if (!this._visible) return; this._transfer = false; this.setData({ notice: '页面切换失败，可使用当前页面继续或重试。' }); this._startTicker(); } });
    },
    _canWork() {
      return !!this._session && !this._transfer && ['idle', 'working', 'ready', 'paused'].includes(this._session.state) && !(this._session.state === 'paused' && this._session.pausedFrom === 'rest');
    },
    canStartOptical() { return this._canWork() && this.data.exercise.sensor === 'optical'; },
    _pauseForCalibration(mode) {
      this._preparingSensor = true;
      if (this._session && this._session.state === 'working') this._session.pause(Date.now());
      this._counter.pause(); this._flushUsage(true);
      this.setData({ selectedMode: mode, phase: 'calibrating', notice: '' });
    },
    _startWork(mode) {
      if (!this._canWork()) return false;
      const session = this._session;
      if (session.state !== 'working') session.start(Date.now(), mode);
      this._preparingSensor = false;
      if (!session.modes.includes(mode)) session.modes.push(mode);
      session.lastMode = mode;
      if (!this.data.exercise.isTimed) {
        this._counter.reset(); this._counter.count = session.current().actual;
        this._counter.minIntervalMs = mode === 'touch' ? 600 : 0; this._counter.start(mode);
      }
      this.setData({ selectedMode: mode, phase: 'running', notice: '' }); this._syncSession(); return true;
    },
    startCounting() {
      if (!this._canWork()) return;
      if (this.data.selectedMode === 'optical') return this.startOptical();
      if (this.data.selectedMode === 'gyro') return this.startGyro();
      this._startWork(this.data.exercise.isTimed ? 'timer' : 'touch');
    },
    onOpticalStarting() { if (this._gyro) this._gyro.stop(); this._pauseForCalibration('optical'); },
    onOpticalStarted() { this.setData({ phase: 'calibrating' }); },
    onOpticalSignal(signal) {
      if (signal.state === 'READY' && this.data.phase === 'calibrating') this._startWork('optical');
      if (signal.state === 'CALIBRATING' && this._session && this._session.state === 'working') this._pauseForCalibration('optical');
    },
    onOpticalCount(at) { this._acceptCount('optical', at); },
    onOpticalFault(message) { this._fallbackTouch(message); },
    onOpticalStopped() { this._preparingSensor = false; if (this._session) { this._session.pause(Date.now()); this._flushUsage(true); this._syncSession(); } },
    startGyro() {
      if (!this._canWork() || this.data.exercise.sensor !== 'gyro') return;
      this._releaseOptical(false); this._pauseForCalibration('gyro'); this._gyro.start({ axis: this.data.gyroAxisIndex === 0 ? 'x' : 'auto' });
    },
    onGyroAxisChange(event) {
      const value = Number(event.detail.value) === 1 ? 1 : 0;
      this.setData({ gyroAxisIndex: value }); if (this._session) this._session.gyroAxisIndex = value;
      if (this.data.selectedMode === 'gyro' && ['running', 'calibrating'].includes(this.data.phase)) this.startGyro();
    },
    _fallbackTouch(message) {
      if (!this._visible || !this._session) return;
      this._gyro.stop(); this._releaseOptical(false);
      this._startWork('touch'); this.setData({ notice: message + ' 已降级触屏，完成量保留。' });
    },
    selectTouch() {
      if (!this._session || this.data.exercise.isTimed) return;
      const active = this._session.state === 'working' || this.data.phase === 'calibrating';
      this._stopSensors(); this.setData({ selectedMode: 'touch' });
      if (active) this._startWork('touch');
    },
    pauseCounting() {
      if (!this._session) return;
      this._session.pause(Date.now()); this._stopSensors(); this._flushUsage(true); this._syncSession();
    },
    endCounting() {
      if (!this._session || this._transfer) return;
      this._session.finish(Date.now(), this._session.purpose === 'plan'); this._stopSensors(); this._flushUsage(true); this._syncSession();
    },
    finishGroup() { if (this._session && this._session.finishSet(Date.now(), false)) { this._stopSensors(); this._syncSession(); } },
    skipGroup() {
      if (!this._session) return;
      if (this._session.state === 'ready') this._session.start(Date.now(), 'manual');
      if (this._session.finishSet(Date.now(), true)) { this._stopSensors(); this._syncSession(); }
    },
    _acceptCount(source, at) {
      if (!this._session || this._session.state !== 'working' || !this._counter.addCount(source, at)) return;
      if (this._session.add(at)) { if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ fail() {} }); this._syncSession(); }
    },
    onTouchStart(event) {
      if (!this._session || this._session.state !== 'working') return;
      if (this._counter.touchStart(Date.now(), event.touches ? event.touches.length : 0)) {
        this._session.add(Date.now()); if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ fail() {} }); this._syncSession();
      }
    },
    onTouchEnd(event) { this._counter.touchEnd(event.touches ? event.touches.length : 0); },
    preventTouchMove() {},
    manualAdd() { this._acceptCount('manual', Date.now()); },
    undoCount() { if (this._session && this._session.undo(Date.now())) { this._counter.undoCount(); this._syncSession(); } },
    resetCount() {
      if (!this._session || this._session.state !== 'working' || this.data.exercise.isTimed) return;
      this._session.current().actual = 0; this._counter.count = 0; this.recalibrateOptical();
      if (this.data.selectedMode === 'optical') this._pauseForCalibration('optical');
      if (this.data.selectedMode === 'gyro') this.startGyro();
      if (!this._preparingSensor) this._syncSession();
    },
    onTargetInput(event) { this.setData({ targetDraft: event.detail.value }); },
    applyTarget() {
      if (!this._session || !this._session.setTarget(Number(this.data.targetDraft), Date.now())) return this.setData({ notice: '请输入有效的正整数目标。' });
      this.setData({ notice: '' }); this._syncSession();
    },
    extendRest() { this._session.extendRest(Date.now(), 30); this._syncSession(); },
    endRest() { this._session.endRest(Date.now()); this._syncSession(); },
    resumeRest() { this._session.resumeRest(Date.now()); this._syncSession(); },
    nextGroup() { this._session.endRest(Date.now()); this._route('training', true); },
    correctPrevious() { if (this._session && ['rest', 'ready'].includes(this._session.state)) { this._session.current().actual = Math.max(0, this._session.current().actual - 1); this._syncSession(); } }
  });
}
module.exports = { createTrainingPage };
