const { OpticalFSM } = require('../../core/optical-fsm');
const { Counter } = require('../../core/counter');
const { getLuminance } = require('../../core/luminance');
const { inspectCapabilities } = require('../../core/capabilities');
const { DEFAULTS, thresholds } = require('../../core/config');
const { buildSignal } = require('../../core/signals');

const ISSUES = {
  TOO_DARK: '环境过暗，请增加照明后重新校准。',
  UNSTABLE: '校准期间光线不稳定，请保持镜头无遮挡并固定手机。',
  ENVIRONMENT_CHANGED: '环境亮度明显改变，请重新校准。',
  OCCLUSION_TIMEOUT: '持续遮挡或光线持续降低，无法确认完整周期，请重新校准。'
};

Page({
  data: {
    device: '', base: '', version: '', canCamera: false, capabilityReason: '',
    cameraMounted: false, active: false, busy: false, paused: false,
    source: '', modeName: '未开始', status: '选择真机摄像头、模拟信号或触屏实验。',
    count: 0, state: '—', issue: '', raw: '—', filtered: '—', baseline: '—', ratio: '—',
    progress: 0, sensitivity: 50, darkThreshold: '0.63', lightThreshold: '0.81',
    minInterval: 600, vibration: true, frameInfo: '尚未接收到帧', processingMs: '—',
    samples: 0, privacyVisible: false, scenarioIndex: 0,
    scenarios: ['正常周期（应新增 3 次）', '快速抖动（应新增 0 次）', '持续遮挡（应新增 0 次）', '环境过暗（应新增 0 次）', '校准不稳定（应新增 0 次）']
  },

  onLoad() {
    this._session = 0;
    this._visible = true;
    this._counter = new Counter();
    this._sensitivity = 50;
    this._updateCapabilities();
  },

  onShow() {
    this._visible = true;
    if (this._resumeCamera) {
      this._resumeCamera = false;
      this.startCamera();
    }
  },

  onHide() {
    this._visible = false;
    this._resumeCamera = this._source === 'camera' && this.data.cameraMounted;
    this._release('已进入后台，采集与计数已暂停；摄像头返回后重新校准。');
  },

  onUnload() {
    this._visible = false;
    this._resumeCamera = false;
    this._release('', true);
  },

  _updateCapabilities() {
    this._capabilities = inspectCapabilities(wx);
    const c = this._capabilities;
    this.setData({ device: c.device, base: c.base, version: c.version, canCamera: c.canCamera, capabilityReason: c.reason });
  },

  _valid(token) { return this._visible && token === this._session; },

  _release(status, unloading) {
    this._session += 1; // 使所有旧授权回调、帧回调、超时回调失效。
    clearTimeout(this._startupTimer);
    clearInterval(this._watchdog);
    clearInterval(this._simulationTimer);
    this._startupTimer = null;
    this._watchdog = null;
    this._simulationTimer = null;
    if (this._privacyResolve) {
      const resolve = this._privacyResolve;
      this._privacyResolve = null;
      resolve({ event: 'disagree' });
    }
    const listener = this._listener;
    this._listener = null;
    if (listener) {
      try { listener.stop({ fail() {} }); } catch (_) { /* 销毁 camera 组件继续释放硬件 */ }
    }
    this._context = null;
    this._fsm = null;
    this._source = null;
    this._counter.stop();
    if (!unloading) this.setData({ cameraMounted: false, active: false, busy: false, paused: false, privacyVisible: false, status });
  },

  _newDetector() {
    this._fsm = new OpticalFSM(thresholds(this._sensitivity));
    this._lastRenderAt = -Infinity;
    this._lastSampleAt = -Infinity;
    this._samples = 0;
    this.setData({ state: 'CALIBRATING', issue: '', raw: '—', filtered: '—', baseline: '—', ratio: '—', progress: 0, samples: 0 });
  },

  startCamera() {
    if (!this._visible) return;
    this._release('检查摄像头能力与授权…');
    this._updateCapabilities();
    if (!this._capabilities.canCamera) return this._fallback(this._capabilities.reason);
    const token = this._session;
    this.setData({ busy: true, modeName: '摄像头亮度（实验）', source: 'camera', issue: '' });
    this._startupTimer = setTimeout(() => {
      if (this._valid(token)) this._fallback('摄像头授权或初始化超时，请检查权限与隐私配置。');
    }, DEFAULTS.startupTimeoutMs);
    wx.requirePrivacyAuthorize({
      success: () => {
        if (!this._valid(token)) return;
        wx.authorize({
          scope: 'scope.camera',
          success: () => {
            if (!this._valid(token)) return;
            // 等待视图确认卸载，防止连续重开时 setData 合并导致没有新的 initdone。
            this.setData({ cameraMounted: false }, () => {
              if (!this._valid(token)) return;
              this._source = 'camera';
              this._newDetector();
              this.setData({ cameraMounted: true, status: '正在初始化前置摄像头，请保持镜头无遮挡。' });
            });
          },
          fail: () => { if (this._valid(token)) this._fallback('未取得摄像头权限；可点击“权限设置”后重试。'); }
        });
      },
      fail: () => { if (this._valid(token)) this._fallback('未完成隐私授权，请确认小程序后台已配置相机用途。'); }
    });
  },

  presentPrivacy(resolve) {
    if (!this._visible || !this.data.busy) return resolve({ event: 'disagree' });
    if (this._privacyResolve) this._privacyResolve({ event: 'disagree' });
    this._privacyResolve = resolve;
    this.setData({ privacyVisible: true });
  },

  agreePrivacy() {
    const resolve = this._privacyResolve;
    this._privacyResolve = null;
    this.setData({ privacyVisible: false });
    if (resolve) resolve({ event: 'agree', buttonId: 'privacy-agree' });
  },

  rejectPrivacy() { this._fallback('你已取消隐私授权。'); },

  openPrivacy() {
    if (typeof wx.openPrivacyContract === 'function') {
      wx.openPrivacyContract({ fail: () => wx.showToast({ title: '请先在小程序后台配置隐私指引', icon: 'none' }) });
    }
  },

  openSettings() {
    const token = this._session;
    wx.openSetting({
      success: () => { if (this._valid(token)) this.setData({ status: '权限设置已返回；请主动点击开启摄像头重试。' }); },
      fail: () => wx.showToast({ title: '请在微信或系统设置中检查相机权限', icon: 'none' })
    });
  },

  onCameraReady() {
    if (!this.data.cameraMounted || this._source !== 'camera' || this._listener) return;
    const token = this._session;
    try {
      this._context = wx.createCameraContext();
      if (!this._context || typeof this._context.onCameraFrame !== 'function') return this._fallback('实际 CameraContext 不支持取帧。');
      const listener = this._context.onCameraFrame((frame) => {
        if (!this._valid(token) || !this.data.active || this._source !== 'camera') return;
        const at = Date.now();
        this._lastFrameAt = at;
        if (at - this._lastSampleAt < DEFAULTS.sampleIntervalMs) return;
        this._lastSampleAt = at;
        try {
          const started = Date.now();
          const signal = getLuminance(frame);
          this._frameInfo = frame.width + ' × ' + frame.height + ' / 抽样像素 ' + signal.samples;
          this._processingMs = Date.now() - started;
          this._ingest(signal.value, at);
        } catch (_) { this._fallback('收到的图像帧格式不符合 RGBA 预期。'); }
      });
      if (!listener || typeof listener.start !== 'function' || typeof listener.stop !== 'function') return this._fallback('实际帧监听器缺少 start/stop。');
      this._listener = listener;
      listener.start({
        success: () => {
          if (!this._valid(token)) {
            try { listener.stop({ fail() {} }); } catch (_) { /* 已卸载 */ }
            return;
          }
          clearTimeout(this._startupTimer);
          this._counter.start('camera');
          this._lastFrameAt = Date.now();
          this.setData({ busy: false, active: true, status: '校准约 3 秒：手机固定，前置镜头无遮挡，等待 READY。' });
          this._watchdog = setInterval(() => {
            if (this._valid(token) && Date.now() - this._lastFrameAt > DEFAULTS.silenceTimeoutMs) this._fallback('超过 3 秒未收到摄像头帧。');
          }, 250);
        },
        fail: () => { if (this._valid(token)) this._fallback('启动帧监听失败，请使用触屏并记录机型。'); }
      });
    } catch (_) { if (this._valid(token)) this._fallback('创建摄像头帧监听失败。'); }
  },

  onCameraError() { if (this.data.cameraMounted) this._fallback('camera 组件报错，请检查小程序权限及系统对微信的相机权限。'); },
  onCameraStop() { if (this.data.cameraMounted && this._visible) this._fallback('摄像头被系统中断。'); },

  _ingest(value, at) {
    const result = this._fsm.feed(value, at);
    this._samples += 1;
    if (result.counted && this._counter.addCount(this._source, at)) this._feedback();
    if (result.counted || result.state !== this.data.state || at - this._lastRenderAt >= 200) {
      this._lastRenderAt = at;
      const number = (v) => Number.isFinite(v) ? v.toFixed(1) : '—';
      this.setData({
        count: this._counter.getCount(), state: result.state, raw: number(result.raw),
        filtered: number(result.filtered), baseline: number(result.baseline),
        ratio: result.ratio === null ? '—' : result.ratio.toFixed(2), progress: result.calibrationProgress,
        samples: this._samples, frameInfo: this._source === 'camera' ? this._frameInfo : '模拟数值，不含相机画面',
        processingMs: this._source === 'camera' ? this._processingMs : '—',
        status: result.state === 'READY' ? '等待稳定遮挡与恢复；每个完整周期最多计 1 次。' : this.data.status
      });
    }
    if (result.issue) this._fallback(ISSUES[result.issue] || result.issue);
  },

  _fallback(message) {
    this.startTouch();
    this.setData({ issue: message, state: 'FAULT', status: message + ' 已切换到触屏计数，可重新开启摄像头校准。' });
  },

  startTouch() {
    this._release('在下方大区域轻触计数，持续按住只计一次。');
    this._source = 'touch';
    this._counter.start('touch');
    this.setData({ source: 'touch', modeName: '触屏（降级）', active: true, state: '—', issue: '', count: this._counter.getCount() });
  },

  onScenarioChange(event) { this.setData({ scenarioIndex: Number(event.detail.value) }); },

  startSimulation() {
    this._release('正在播放模拟信号；不代表硬件已验证。');
    this._source = 'simulation';
    this._counter.start('simulation');
    this._newDetector();
    this.setData({ source: 'simulation', modeName: '模拟信号 · 非真机', active: true });
    const kinds = ['normal', 'jitter', 'held', 'dark', 'unstable'];
    const signal = buildSignal(kinds[this.data.scenarioIndex]);
    const token = this._session;
    const origin = Date.now();
    const initialCount = this._counter.getCount();
    let position = 0;
    this._simulationTimer = setInterval(() => {
      if (!this._valid(token)) return;
      if (position >= signal.length) {
        const added = this._counter.getCount() - initialCount;
        this._release('模拟结束，本段新增 ' + added + ' 次；结果仅验证算法。');
        return;
      }
      const sample = signal[position++];
      this._ingest(sample.value, origin + sample.at);
    }, DEFAULTS.sampleIntervalMs);
  },

  onTouchStart(event) {
    if (event.touches && event.touches.length !== 1) return;
    if (this._counter.touchStart(Date.now())) {
      this.setData({ count: this._counter.getCount() });
      this._feedback();
    }
  },
  onTouchEnd() { this._counter.touchEnd(); },
  preventMove() {},
  manualAdd() { if (this._counter.addCount('manual', Date.now())) this.setData({ count: this._counter.getCount() }); },
  undo() { this.setData({ count: this._counter.undoCount() }); },

  resetCount() {
    this._counter.reset();
    if (this.data.active) this._counter.start(this._source);
    if (this._fsm) this._newDetector();
    this.setData({ count: 0 });
  },

  stop() {
    this._resumeCamera = false;
    this._release('已停止并释放摄像头，次数保留在本次页面内存中。');
  },

  togglePause() {
    if (this.data.paused) {
      if (this._pausedSource === 'camera') this.startCamera();
      else if (this._pausedSource === 'simulation') this.startSimulation();
      else this.startTouch();
    } else {
      this._pausedSource = this._source;
      this._release('已暂停；恢复摄像头时重新校准，恢复模拟时从头播放。');
      this.setData({ paused: true });
    }
  },

  onSensitivityChange(event) {
    this._sensitivity = Number(event.detail.value);
    const t = thresholds(this._sensitivity);
    this.setData({ sensitivity: this._sensitivity, darkThreshold: t.darkRatio.toFixed(2), lightThreshold: t.lightRatio.toFixed(2) });
    if (this._source === 'simulation') this.startSimulation();
    else if (this._fsm) this._newDetector();
  },
  onIntervalChange(event) {
    const value = Number(event.detail.value);
    this._counter.minIntervalMs = value;
    this.setData({ minInterval: value });
  },
  onVibrationChange(event) { this.setData({ vibration: !!event.detail.value }); },
  _feedback() { if (this.data.vibration && typeof wx.vibrateShort === 'function') wx.vibrateShort({ fail() {} }); },

  copyDiagnostics() {
    const diagnostics = {
      experiment: 'phase-0', hardwareValidation: '待真机验证（需人工填写测试表）',
      device: this.data.device, base: this.data.base, wechat: this.data.version,
      source: this.data.source, state: this.data.state, count: this.data.count,
      baseline: this.data.baseline, ratio: this.data.ratio, issue: this.data.issue,
      sensitivity: this._sensitivity, thresholds: thresholds(this._sensitivity),
      minIntervalMs: this.data.minInterval, frame: this.data.frameInfo, samples: this.data.samples
    };
    wx.setClipboardData({ data: JSON.stringify(diagnostics, null, 2), fail: () => wx.showToast({ title: '复制失败，可手动记录数值', icon: 'none' }) });
  }
});
