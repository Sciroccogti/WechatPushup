const { getExerciseViewById, getExerciseSelection } = require('../utils/exercise-view');
const { nextTouchFeedback } = require('../utils/touch-feedback');
const { durationLabel } = require('../utils/time');
const { CounterManager } = require('../domain/counter/manager');
const { TrainingStore } = require('./training-store');
const { beginSession, getSession, clearSession } = require('./session-runtime');
const { GyroSource } = require('./gyro-source');
const { SitupSource } = require('./situp-source');
const { GYRO_AXES } = require('../config/gyro');
const { withOpticalPage } = require('./optical-page');

function createTrainingPage(surface) {
  return withOpticalPage({
    data: { exercise: null, count: 0, total: 0, selectedMode: 'touch', phase: 'idle', notice: '', blockedMessage: '',
      exercises: [], exerciseNames: [], exerciseIndex: 0, sortOptions: ['累计训练时长', '最近使用'], sortIndex: 0,
      feedbackColor: '#f2f5fa', touchRipples: [], groupSettingsOpen: false,
      purpose: 'free', groupNumber: 1, groupCount: 1, target: '—', targetDraft: '', restSeconds: 0,
      elapsed: '0秒', groupRows: [], gyroAxisLabel: GYRO_AXES[0], gyro: { state: 'IDLE', x: '—', y: '—', z: '—', angle: '—' },
      motion: { state: 'IDLE', tilt: '—', auxiliary: '旋转辅助' } },
    onLoad(options) {
      const params = options || {};
      const exercise = getExerciseViewById(params.exerciseId);
      this._counter = new CounterManager(); this._trainingStore = new TrainingStore(wx);
      this._motion = new SitupSource(wx, {
        signal: (signal) => {
          if (!this._visible) return;
          if (signal.state === 'READY' && this._sensorTouchCycle === 'motion') this._sensorTouchCycle = null;
          if (signal.state === 'READY' && this.data.phase === 'calibrating') this._startWork('motion');
          if (signal.state === 'CALIBRATING' && this._session && this._session.state === 'working') this._pauseForCalibration('motion');
          const at = Date.now();
          if (at - (this._motionRenderAt || 0) >= 200 || signal.counted || this.data.motion.state !== signal.state || this.data.notice !== signal.auxMessage) {
            this._motionRenderAt = at;
            this.setData({ motion: { state: signal.state, tilt: signal.tilt.toFixed(1), auxiliary: signal.rotationAvailable ? '旋转辅助已接入' : '仅加速度' }, notice: signal.auxMessage || '' });
          }
        },
        count: (at) => this._acceptCount('motion', at), fault: (message) => this._fallbackTouch(message)
      });
      this._gyro = new GyroSource(wx, {
        signal: (signal) => {
          if (!this._visible) return;
          const at = Date.now();
          if (signal.state === 'READY' && this._sensorTouchCycle === 'gyro') this._sensorTouchCycle = null;
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
      this._loadExerciseSelection();
      if (!exercise) return;
      this._prefs.markUsed(exercise.id);
      const initialMode = exercise.isTimed ? 'timer' : params.mode === exercise.sensor ? params.mode : exercise.sensor === 'motion' && params.mode === 'gyro' ? 'motion' : 'touch';
      this.setData({ storageMessage: this._prefs.warning || this._trainingStore.warning, selectedMode: initialMode });
      if (params.sessionId) {
        const session = getSession(params.sessionId);
        if (!session || session.exerciseId !== exercise.id) return this.setData({ blockedMessage: '这次训练已结束或页面已重启，请重新进入计划。' });
        this._session = session;
        this.setData({ selectedMode: exercise.sensor === 'motion' && session.lastMode === 'gyro' ? 'motion' : session.lastMode || (exercise.isTimed ? 'timer' : 'touch') });
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
      this.setData({ touchRipples: [], feedbackColor: this._lastFeedbackColor || this.data.feedbackColor });
      this._loadExerciseSelection();
      if (!this._session) return;
      this._syncSession(); this._startTicker();
      if (this._autoStart) { this._autoStart = false; this.startCounting(); }
    },
    onHide() {
      this._clearTouchFeedback(false);
      this._stopTicker();
      if (this._session) { if (!this._transfer) this._session.pause(Date.now()); this._stopSensors(); this._flushUsage(true); if (!this._transfer) this._syncSession(); }
    },
    onUnload() {
      this._clearTouchFeedback(false);
      this._stopTicker(); this._stopSensors();
      if (this._session) {
        if (!this._transfer && this._session.state !== 'finished') {
          this._session.finish(Date.now(), true);
          if (!this._saveCurrentResult()) wx.showToast({ title: '训练结果未能保存，请检查本地存储', icon: 'none' });
          clearSession(this._session.id);
        }
        this._flushUsage(true);
      }
    },
    _loadExerciseSelection() {
      const preferences = this._prefs.load();
      this.setData(Object.assign(getExerciseSelection(preferences, this.data.exercise && this.data.exercise.id), { storageMessage: this._prefs.warning || this._trainingStore.warning }));
      if (this.data.exercise && this.data.exercise.sensor === 'gyro') this.setData({ gyroAxisLabel: GYRO_AXES[preferences.gyro[this.data.exercise.id].axis === 'x' ? 0 : 1] });
    },
    onSortChange(event) {
      this._prefs.setSortMode(Number(event.detail.value) === 0 ? 'duration' : 'recent');
      this.setData(Object.assign(getExerciseSelection(this._prefs.value, this.data.exercise && this.data.exercise.id), { storageMessage: this._prefs.warning }));
    },
    _saveCurrentResult() {
      const result = this._session.result(3);
      if (result.actual === 0 && (result.activeMs === 0 || result.purpose === 'assessment')) return true;
      return this._trainingStore.finish(result);
    },
    onExerciseChange(event) {
      if (this._transfer || ['running', 'calibrating'].includes(this.data.phase)) return;
      const exercise = this.data.exercises[Number(event.detail.value)];
      if (!exercise || (this.data.exercise && exercise.id === this.data.exercise.id && !this.data.blockedMessage)) return;
      if (this._session) {
        this._session.finish(Date.now(), true); this._stopSensors(); this._flushUsage(true);
        if (!this._saveCurrentResult()) return this.setData({ notice: this._trainingStore.warning + ' 已结束当前训练；保存成功后再切换。' });
        clearSession(this._session.id); this._session = null;
      }
      this._transfer = true; this._stopTicker(); this._clearTouchFeedback(false);
      wx.redirectTo({ url: exercise.freeUrl, fail: () => {
        if (!this._visible) return;
        this._transfer = false;
        this.setData({ blockedMessage: '切换失败，请在上方重新选择项目。' });
      } });
    },
    _showTouchFeedback(event) {
      if (!this._visible || surface !== 'training') return;
      clearTimeout(this._colorTimer); clearTimeout(this._rippleTimer);
      const feedback = nextTouchFeedback(event, this._lastFeedbackColor || this.data.feedbackColor);
      this._lastFeedbackColor = feedback.color;
      const id = (this._rippleSequence || 0) + 1; this._rippleSequence = id;
      this.setData({ touchRipples: [Object.assign({ id }, feedback)] });
      this._colorTimer = setTimeout(() => { if (this._visible && id === this._rippleSequence) this.setData({ feedbackColor: feedback.color }); }, 520);
      this._rippleTimer = setTimeout(() => { if (this._visible && id === this._rippleSequence) this.setData({ touchRipples: [] }); }, 720);
    },
    _clearTouchFeedback(render) {
      clearTimeout(this._colorTimer); clearTimeout(this._rippleTimer);
      this._rippleSequence = (this._rippleSequence || 0) + 1; this._timerTouchHeld = false;
      if (render && this._visible) this.setData({ touchRipples: [] });
    },
    onControlTouchStart(event) {
      // 用mark在根处理器排除控件；不拦截touchend，以保留原生按钮完整点击链。
      if (event && event.touches && event.touches.length === 1) {
        this._controlTouch = event.touches[0]; this._controlTouchAt = Date.now();
      }
    },
    _startTicker() {
      this._stopTicker();
      if (!this._visible || !this._session || this._transfer || !['working', 'rest'].includes(this._session.state)) return;
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
      this._sensorTouchCycle = null;
      this._releaseOptical(!this._visible);
      if (this._gyro) this._gyro.stop();
      if (this._motion) this._motion.stop();
      this._counter.pause();
    },
    _syncSession() {
      const session = this._session;
      if (!session) return;
      const phase = this._preparingSensor ? 'calibrating' : session.state === 'working' ? 'running' : session.state;
      const values = { phase, purpose: session.purpose, count: session.current().actual,
        total: session.groups.reduce((sum, group) => sum + group.actual, 0), groupNumber: session.index + 1, groupCount: session.groups.length,
        target: session.current().target === null ? '—' : session.current().target, elapsed: durationLabel(session.activeMs),
        restSeconds: session.state === 'rest' ? Math.max(0, Math.ceil((session.restUntil - Date.now()) / 1000)) : session.state === 'paused' && session.pausedFrom === 'rest' ? Math.ceil(session.remainingRest / 1000) : 0,
        groupRows: session.groups.map((group, index) => ({ number: index + 1, target: group.target === null ? '—' : group.target, actual: group.actual, status: group.status === 'completed' ? '完成' : group.status === 'skipped' ? '跳过' : '待完成' })) };
      const patch = {};
      for (const [key, value] of Object.entries(values)) {
        if (typeof value === 'object' ? JSON.stringify(value) !== JSON.stringify(this.data[key]) : value !== this.data[key]) patch[key] = value;
      }
      if (Object.keys(patch).length) this.setData(patch);
      if (['rest', 'ready', 'finished'].includes(session.state) && !this._preparingSensor) {
        if (session.state === 'ready' && this._lastSessionState === 'rest' && typeof wx.vibrateShort === 'function') wx.vibrateShort({ fail() {} });
        if (this._lastSessionState !== session.state) { this._stopSensors(); this._flushUsage(true); }
        if (session.state === 'finished') this._route('summary', false);
        else if (surface !== 'rest' && !this._autoStart) this._route('rest', false);
      }
      this._lastSessionState = session.state;
      if (!this._transfer && ['working', 'rest'].includes(session.state)) { if (!this._ticker) this._startTicker(); }
      else this._stopTicker();
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
      this._sensorTouchCycle = null;
      if (!session.modes.includes(mode)) session.modes.push(mode);
      session.lastMode = mode;
      if (!this.data.exercise.isTimed) {
        this._counter.reset(); this._counter.count = session.current().actual;
        this._counter.minIntervalMs = mode === 'touch' ? 600 : 0; this._counter.start(mode);
      }
      this.setData({ selectedMode: mode, phase: 'running', notice: '' }); this._syncSession(); return true;
    },
    startCounting(event) {
      if (!this._canWork()) return;
      if (this.data.groupSettingsOpen) this.setData({ groupSettingsOpen: false });
      if (this.data.selectedMode === 'optical') return this.startOptical();
      if (this.data.selectedMode === 'gyro') return this.startGyro();
      if (this.data.selectedMode === 'motion') return this.startMotion();
      if (this._startWork(this.data.exercise.isTimed ? 'timer' : 'touch') && this.data.exercise.isTimed) {
        const point = event && !event.touches && this._controlTouch && Date.now() - this._controlTouchAt < 1000 ? { touches: [this._controlTouch] } : event;
        this._showTouchFeedback(point);
      }
    },
    onOpticalStarting() { if (this._gyro) this._gyro.stop(); if (this._motion) this._motion.stop(); this._pauseForCalibration('optical'); },
    onOpticalStarted() { this.setData({ phase: 'calibrating' }); },
    onOpticalSignal(signal) {
      if (signal.state === 'READY' && this._sensorTouchCycle === 'optical') this._sensorTouchCycle = null;
      if (signal.state === 'READY' && this.data.phase === 'calibrating') this._startWork('optical');
      if (signal.state === 'CALIBRATING' && this._session && this._session.state === 'working') this._pauseForCalibration('optical');
    },
    onOpticalCount(at) { this._acceptCount('optical', at); },
    onOpticalFault(message) { this._fallbackTouch(message); },
    onOpticalStopped() { this._preparingSensor = false; if (this._session) { this._session.pause(Date.now()); this._flushUsage(true); this._syncSession(); } },
    startGyro() {
      if (!this._canWork() || this.data.exercise.sensor !== 'gyro') return;
      const settings = this._prefs.load().gyro[this.data.exercise.id];
      this.setData({ gyroAxisLabel: GYRO_AXES[settings.axis === 'x' ? 0 : 1], storageMessage: this._prefs.warning });
      this._motion.stop(); this._releaseOptical(false); this._pauseForCalibration('gyro'); this._gyro.start(settings);
    },
    startMotion() {
      if (!this._canWork() || this.data.exercise.sensor !== 'motion') return;
      const settings = this._prefs.load().situp;
      this._gyro.stop(); this._releaseOptical(false); this._pauseForCalibration('motion');
      this._motion.start(settings);
    },
    selectSensorMode() {
      if (!this._canWork() || !['idle', 'paused'].includes(this.data.phase) || !this.data.exercise.sensor) return;
      this._stopSensors(); this.setData({ selectedMode: this.data.exercise.sensor, notice: '' });
    },
    toggleGroupSettings() { this.setData({ groupSettingsOpen: !this.data.groupSettingsOpen, targetDraft: this.data.target === '—' ? '' : String(this.data.target) }); },
    _fallbackTouch(message) {
      if (!this._visible || !this._session) return;
      this._gyro.stop(); this._motion.stop(); this._releaseOptical(false);
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
      this._clearTouchFeedback(true);
      this._session.pause(Date.now()); this._stopSensors(); this._flushUsage(true); this._syncSession();
    },
    endCounting() {
      if (!this._session || this._transfer) return;
      this._session.finish(Date.now(), this._session.purpose === 'plan'); this._stopSensors(); this._flushUsage(true); this._syncSession();
    },
    finishGroup() {
      if (!this._session) return;
      if (this._session.state === 'paused' && this._session.pausedFrom === 'working') this._session.start(Date.now(), 'manual');
      if (this._session.finishSet(Date.now(), false)) { this._stopSensors(); this._syncSession(); }
    },
    skipGroup() {
      if (!this._session) return;
      if (this._session.state === 'paused' && this._session.pausedFrom === 'working') this._session.start(Date.now(), 'manual');
      if (this._session.state === 'ready') this._session.start(Date.now(), 'manual');
      if (this._session.finishSet(Date.now(), true)) { this._stopSensors(); this._syncSession(); }
    },
    _acceptCount(source, at) {
      if (source === this._sensorTouchCycle) { this._sensorTouchCycle = null; return; }
      if (!this._session || this._session.state !== 'working' || !this._counter.addCount(source, at)) return;
      if (this._session.add(at)) { if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ fail() {} }); this._syncSession(); }
    },
    onTouchStart(event) {
      if (event && event.mark && event.mark.control) return;
      if (!this._session || this._transfer || surface !== 'training') return;
      if (this.data.exercise.isTimed) {
        if (this._timerTouchHeld) return;
        this._timerTouchHeld = true;
        if (!event.touches || event.touches.length !== 1) return;
        if (this._session.state === 'working') this._showTouchFeedback(event);
        else if (['idle', 'paused'].includes(this._session.state)) this.startCounting(event);
        return;
      }
      if (this._session.state !== 'working') return;
      if (this._counter.touchStart(Date.now(), event.touches ? event.touches.length : 0)) {
        if (this.data.selectedMode === 'optical' && this._fsm && (['DARK', 'LIGHT'].includes(this._fsm.state) || this._fsm.darkAt !== null)) this._sensorTouchCycle = 'optical';
        if (this.data.selectedMode === 'gyro' && this._gyro.fsm && ['OUT', 'BACK'].includes(this._gyro.fsm.state)) this._sensorTouchCycle = 'gyro';
        if (this.data.selectedMode === 'motion' && this._motion.fsm && ['OUT', 'BACK'].includes(this._motion.fsm.state)) this._sensorTouchCycle = 'motion';
        this._session.add(Date.now());
        if (!this._session.modes.includes('touch')) this._session.modes.push('touch');
        this._showTouchFeedback(event);
        if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ fail() {} }); this._syncSession();
      }
    },
    onTouchEnd(event) { const remaining = event.touches ? event.touches.length : 0; this._counter.touchEnd(remaining); if (!remaining) this._timerTouchHeld = false; },
    onTouchCancel() { this._counter.touchEnd(0); this._timerTouchHeld = false; },
    preventTouchMove() {},
    manualAdd() { this._acceptCount('manual', Date.now()); },
    undoCount() { if (this._session && this._session.undo(Date.now())) { this._counter.undoCount(); this._syncSession(); } },
    resetCount() {
      if (!this._session || this._session.state !== 'working' || this.data.exercise.isTimed) return;
      this._session.current().actual = 0; this._counter.count = 0; this.recalibrateOptical();
      if (this.data.selectedMode === 'optical') this._pauseForCalibration('optical');
      if (this.data.selectedMode === 'gyro') this.startGyro();
      if (this.data.selectedMode === 'motion') this.startMotion();
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
