const { OpticalFSM } = require('../domain/optical/fsm');
const { getLuminance } = require('../domain/optical/luminance');
const { DEFAULTS } = require('../domain/optical/config');
const { buildSignal } = require('../domain/optical/signals');
const { DEFAULT_OPTICAL, changeOptical, opticalSliders } = require('../config/optical');
const { PreferencesStore } = require('./preferences');
const { inspectCapabilities } = require('./camera-capabilities');

const ISSUES = {
  TOO_DARK: '环境过暗，请增加照明后重新校准。', UNSTABLE: '光线不稳定，请固定手机、保持镜头无遮挡后重新校准。',
  ENVIRONMENT_CHANGED: '环境亮度明显改变，请重新校准。', OCCLUSION_TIMEOUT: '持续遮挡或亮度降低，请移开遮挡后重新校准。'
};
const STATES = { CALIBRATING: '校准中，请保持镜头无遮挡约 3 秒。', READY: '等待稳定遮挡与恢复。', DARK: '已确认遮挡，等待恢复。', LIGHT: '正在确认光线恢复。', COUNT: '完整周期已计数。' };

function initialOptical(allowSimulation) {
  return {
    mounted: false, cameraEpoch: 0, active: false, busy: false, privacyVisible: false, canCamera: false, capability: '',
    allowSimulation: !!allowSimulation, source: '', state: 'IDLE', status: '主动开启相机测试，或使用模拟信号。',
    raw: '—', filtered: '—', baseline: '—', ratio: '—', progress: 0, testCount: 0,
    meter: 0, darkMarker: 41, lightMarker: 55, darkPercent: 62, lightPercent: 82,
    darkValue: '—', lightValue: '—', frameInfo: '尚未接收到帧', device: ''
  };
}

// camera 保持在页面模板中，严格使用无参数的公开 wx.createCameraContext()。
// 同一页面只挂一个 camera；硬件回调和定时器以会话标记隔离。
function withOpticalPage(definition) {
  const methods = {
    _validOptical(token) { return this._visible && token === this._opticalEpoch; },
    _readSettings() {
      this._settings = this._prefs.load().optical;
      this.setData({ storageMessage: this._prefs.warning });
      this._displaySettings();
    },
    _displaySettings() {
      this.setData({
        sliders: opticalSliders(this._settings),
        'optical.darkPercent': Math.round(this._settings.darkRatio * 100),
        'optical.lightPercent': Math.round(this._settings.lightRatio * 100),
        'optical.darkMarker': this._settings.darkRatio / 1.5 * 100,
        'optical.lightMarker': this._settings.lightRatio / 1.5 * 100
      });
      if (this._fsm) this._fsm.configure(this._settings);
    },
    _flushSettings(render) {
      if (!this._dirtySettings) return;
      this._prefs.saveOptical(this._settings);
      this._dirtySettings = false;
      if (render !== false) this.setData({ storageMessage: this._prefs.warning });
    },
    _changeSetting(event, save) {
      this._settings = changeOptical(this._settings, event.currentTarget.dataset.key, event.detail.value);
      this._dirtySettings = true;
      this._displaySettings();
      if (save) this._flushSettings();
    },
    onSettingChanging(event) { this._changeSetting(event, false); },
    onSettingChange(event) { this._changeSetting(event, true); },
    resetOpticalSettings() {
      this._settings = Object.assign({}, DEFAULT_OPTICAL);
      this._dirtySettings = true;
      this._displaySettings();
      this._flushSettings();
    },
    _releaseOptical(unloading) {
      this._opticalEpoch += 1;
      clearTimeout(this._cameraTimeout);
      clearInterval(this._frameWatchdog);
      clearInterval(this._simulationTimer);
      this._cameraTimeout = null;
      this._frameWatchdog = null;
      this._simulationTimer = null;
      const resolve = this._privacyResolve;
      this._privacyResolve = null;
      if (resolve) resolve({ event: 'disagree' });
      const listener = this._cameraListener;
      this._cameraListener = null;
      if (listener) { try { listener.stop({ fail() {} }); } catch (_) { /* camera 仍会卸载 */ } }
      this._source = null;
      this._fsm = null;
      if (!unloading) this.setData({ 'optical.mounted': false, 'optical.active': false, 'optical.busy': false, 'optical.privacyVisible': false });
    },
    _newDetector(source) {
      this._source = source;
      this._fsm = new OpticalFSM(this._settings);
      this._lastSampleAt = -Infinity;
      this._lastRenderAt = -Infinity;
      this._faultDelivered = false;
      this.setData({ 'optical.source': source, 'optical.state': 'CALIBRATING', 'optical.progress': 0,
        'optical.raw': '—', 'optical.filtered': '—', 'optical.baseline': '—', 'optical.ratio': '—',
        'optical.testCount': 0, 'optical.status': STATES.CALIBRATING });
    },
    startOptical() {
      if (!this._visible || this._opticalAllowed === false) return;
      if (typeof this.canStartOptical === 'function' && !this.canStartOptical()) return;
      this._releaseOptical(false);
      if (definition.onOpticalStarting) definition.onOpticalStarting.call(this);
      const capability = inspectCapabilities(wx);
      if (!capability.canCamera) return this._opticalFailure(capability.reason);
      const token = this._opticalEpoch;
      this.setData({ 'optical.busy': true, 'optical.status': '请完成隐私与相机授权。' });
      try {
        wx.requirePrivacyAuthorize({
          success: () => {
            if (!this._validOptical(token)) return;
            wx.authorize({ scope: 'scope.camera',
              success: () => {
                if (!this._validOptical(token)) return;
                this.setData({ 'optical.mounted': false }, () => {
                  if (!this._validOptical(token)) return;
                  this._newDetector('camera');
                  this.setData({ 'optical.cameraEpoch': token, 'optical.mounted': true });
                  this._cameraTimeout = setTimeout(() => {
                    if (this._validOptical(token)) this._opticalFailure('相机初始化超时，请检查权限或使用触屏。');
                  }, DEFAULTS.startupTimeoutMs);
                });
              },
              fail: () => { if (this._validOptical(token)) this._opticalFailure('未取得相机权限，可在权限设置中允许后重试。'); }
            });
          },
          fail: () => { if (this._validOptical(token)) this._opticalFailure('未完成隐私授权，请检查小程序后台相机用途配置。'); }
        });
      } catch (_) { if (this._validOptical(token)) this._opticalFailure('相机授权调用失败，请使用触屏。'); }
    },
    presentPrivacy(resolve) {
      if (!this._visible || !this.data.optical.busy) return resolve({ event: 'disagree' });
      if (this._privacyResolve) this._privacyResolve({ event: 'disagree' });
      this._privacyResolve = resolve;
      this.setData({ 'optical.privacyVisible': true });
    },
    agreePrivacy() {
      const resolve = this._privacyResolve;
      this._privacyResolve = null;
      this.setData({ 'optical.privacyVisible': false });
      if (resolve) resolve({ event: 'agree', buttonId: 'fitness-privacy-agree' });
    },
    rejectPrivacy() { this._opticalFailure('已取消隐私授权。'); },
    openPrivacy() {
      if (typeof wx.openPrivacyContract === 'function') wx.openPrivacyContract({ fail: () => wx.showToast({ title: '请先配置小程序隐私保护指引', icon: 'none' }) });
    },
    openCameraSettings() { wx.openSetting({ fail: () => wx.showToast({ title: '请检查系统对微信的相机权限', icon: 'none' }) }); },
    _currentCameraEvent(event) {
      return !event || (event.currentTarget && Number(event.currentTarget.dataset.session) === this._opticalEpoch);
    },
    onCameraReady(event) {
      if (!this._currentCameraEvent(event) || !this._visible || !this.data.optical.mounted || this._source !== 'camera' || this._cameraListener) return;
      const token = this._opticalEpoch;
      try {
        const context = wx.createCameraContext();
        if (!context || typeof context.onCameraFrame !== 'function') return this._opticalFailure('当前相机上下文不支持取帧。');
        const listener = context.onCameraFrame((frame) => {
          if (!this._validOptical(token) || !this.data.optical.active || this._source !== 'camera') return;
          const at = Date.now();
          this._lastFrameAt = at;
          if (at - this._lastSampleAt < DEFAULTS.sampleIntervalMs) return;
          this._lastSampleAt = at;
          try {
            const signal = getLuminance(frame);
            this._frameInfo = frame.width + ' × ' + frame.height + ' · 仅内存亮度抽样';
            this._ingestOptical(signal.value, at);
          } catch (_) { if (this._validOptical(token)) this._opticalFailure('图像帧格式异常，请使用触屏。'); }
        });
        if (!listener || typeof listener.start !== 'function' || typeof listener.stop !== 'function') return this._opticalFailure('当前帧监听器能力不完整。');
        this._cameraListener = listener;
        listener.start({
          success: () => {
            if (!this._validOptical(token)) { try { listener.stop({ fail() {} }); } catch (_) {} return; }
            clearTimeout(this._cameraTimeout);
            this._lastFrameAt = Date.now();
            this.setData({ 'optical.active': true, 'optical.busy': false });
            if (definition.onOpticalStarted) definition.onOpticalStarted.call(this);
            this._frameWatchdog = setInterval(() => {
              if (this._validOptical(token) && Date.now() - this._lastFrameAt > DEFAULTS.silenceTimeoutMs) this._opticalFailure('超过 3 秒没有相机帧，请重试或使用触屏。');
            }, 250);
          },
          fail: () => { if (this._validOptical(token)) this._opticalFailure('启动相机帧监听失败。'); }
        });
      } catch (_) { if (this._validOptical(token)) this._opticalFailure('相机初始化失败。'); }
    },
    onCameraError(event) { if (this._visible && this._currentCameraEvent(event) && this.data.optical.mounted) this._opticalFailure('相机报错，请检查小程序及系统权限。'); },
    onCameraStop(event) { if (this._currentCameraEvent(event) && this._visible && this.data.optical.mounted) this._opticalFailure('相机被系统中断。'); },
    _opticalFailure(message) {
      this._releaseOptical(false);
      this.setData({ 'optical.status': message, 'optical.state': 'FAULT' });
      if (definition.onOpticalFault) definition.onOpticalFault.call(this, message);
    },
    _ingestOptical(value, at) {
      const result = this._fsm.feed(value, at);
      const token = this._opticalEpoch;
      if (definition.onOpticalSignal) definition.onOpticalSignal.call(this, result, at);
      if (!this._validOptical(token)) return;
      if (result.counted) {
        this.setData({ 'optical.testCount': this.data.optical.testCount + 1 });
        if (definition.onOpticalCount) definition.onOpticalCount.call(this, at);
        if (!this._validOptical(token)) return;
      }
      if (result.counted || at - this._lastRenderAt >= 200 || result.state !== this.data.optical.state) {
        this._lastRenderAt = at;
        const number = (v) => Number.isFinite(v) ? v.toFixed(1) : '—';
        this.setData({
          'optical.state': result.state, 'optical.status': ISSUES[result.issue] || STATES[result.state] || '',
          'optical.raw': number(result.raw), 'optical.filtered': number(result.filtered), 'optical.baseline': number(result.baseline),
          'optical.ratio': result.ratio === null ? '—' : result.ratio.toFixed(2), 'optical.progress': result.calibrationProgress,
          'optical.meter': result.ratio === null ? 0 : Math.max(0, Math.min(100, result.ratio / 1.5 * 100)),
          'optical.darkValue': result.baseline === null ? '—' : number(result.baseline * this._settings.darkRatio),
          'optical.lightValue': result.baseline === null ? '—' : number(result.baseline * this._settings.lightRatio),
          'optical.frameInfo': this._source === 'camera' ? this._frameInfo : '模拟信号 · 不代表手机实测'
        });
      }
      if (result.issue && !this._faultDelivered) {
        this._faultDelivered = true;
        if (definition.onOpticalFault) { this._opticalFailure(ISSUES[result.issue]); }
      }
    },
    startOpticalSimulation() {
      if (!this._visible || !definition.allowSimulation || this._opticalAllowed === false) return;
      this._releaseOptical(false);
      this._newDetector('simulation');
      const signal = buildSignal('normal');
      const token = this._opticalEpoch;
      let index = 0;
      this.setData({ 'optical.active': true });
      this._simulationTimer = setInterval(() => {
        if (!this._validOptical(token)) return;
        if (index >= signal.length) return this.stopOptical();
        this._ingestOptical(signal[index++].value, Date.now());
      }, DEFAULTS.sampleIntervalMs);
    },
    recalibrateOptical() {
      if (!this._fsm) return;
      this._fsm.reset();
      this._faultDelivered = false;
      this.setData({ 'optical.state': 'CALIBRATING', 'optical.progress': 0, 'optical.status': STATES.CALIBRATING });
    },
    clearOpticalTest() { this.setData({ 'optical.testCount': 0 }); this.recalibrateOptical(); },
    stopOptical() {
      this._releaseOptical(false);
      this.setData({ 'optical.status': '已停止采集，重新开启时将重新校准。' });
      if (definition.onOpticalStopped) definition.onOpticalStopped.call(this);
    }
  };
  return Object.assign({}, methods, definition, {
    data: Object.assign({ optical: initialOptical(definition.allowSimulation), sliders: opticalSliders(DEFAULT_OPTICAL), storageMessage: '' }, definition.data),
    onLoad(options) {
      this._visible = true;
      this._opticalEpoch = 0;
      this._prefs = new PreferencesStore(wx);
      this._readSettings();
      const capability = inspectCapabilities(wx);
      this.setData({ 'optical.canCamera': capability.canCamera, 'optical.capability': capability.reason, 'optical.device': capability.device + ' · 微信 ' + capability.version + ' / 基础库 ' + capability.base });
      if (definition.onLoad) definition.onLoad.call(this, options);
    },
    onShow() {
      this._visible = true;
      if (this._hasShown) this._readSettings();
      this._hasShown = true;
      if (definition.onShow) definition.onShow.call(this);
    },
    onHide() {
      this._visible = false;
      this._flushSettings();
      this._releaseOptical(false);
      if (definition.onHide) definition.onHide.call(this);
    },
    onUnload() {
      this._visible = false;
      this._flushSettings(false);
      this._releaseOptical(true);
      if (definition.onUnload) definition.onUnload.call(this);
    }
  });
}

module.exports = { withOpticalPage };
