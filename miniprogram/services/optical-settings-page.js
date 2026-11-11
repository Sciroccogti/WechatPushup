const { APP_INFO } = require('../config/app');
const { withOpticalPage } = require('./optical-page');
const { EXERCISES } = require('../config/exercises');
const { DEFAULT_GYRO, GYRO_AXES, changeGyro, gyroSliders } = require('../config/gyro');
const { GyroSource } = require('./gyro-source');
const { SitupSource } = require('./situp-source');
const { DEFAULT_SITUP, changeSitup, situpSliders } = require('../config/situp');

const GYRO_STATUS = { CALIBRATING: '请保持手机静止约 1.2 秒。', READY: '可以开始一个完整往返周期。', OUT: '已检测到转动，等待反向。', BACK: '正在确认返回。', COUNT: '完整周期已计数。', SETTLE: '请短暂静止，再开始下一个周期。' };

function createOpticalSettingsPage() {
  return withOpticalPage({
    allowSimulation: true,
    data: { appName: APP_INFO.name, version: APP_INFO.version,
      exerciseTabs: EXERCISES, selectedExerciseId: 'push-up', selectedExerciseName: '俯卧撑', settingsSensor: 'optical',
      gyroAxes: GYRO_AXES, gyroAxisIndex: 0, gyroSliders: gyroSliders(DEFAULT_GYRO),
      situpSliders: situpSliders(DEFAULT_SITUP), rotationAxisIndex: 0,
      situpTest: { active: false, state: 'IDLE', status: '主动开启加速度主导检测。', tilt: '—', magnitude: '—', auxiliary: '旋转辅助未开启', count: 0 },
      gyroTest: { active: false, state: 'IDLE', status: '主动开启陀螺仪测试。', x: '—', y: '—', z: '—', angle: '—', axis: '—', count: 0 } },
    onLoad(options) {
      this._situpTestSource = new SitupSource(wx, {
        signal: (signal) => {
          if (!this._visible || this.data.settingsSensor !== 'motion') return;
          const at = Date.now();
          if (at - (this._situpRenderAt || 0) < 150 && signal.state === this.data.situpTest.state && !signal.counted && this._situpAuxMessage === signal.auxMessage) return;
          this._situpRenderAt = at; this._situpAuxMessage = signal.auxMessage;
          this.setData({ 'situpTest.state': signal.state, 'situpTest.status': signal.auxMessage || (signal.state === 'CALIBRATING' ? '在起始姿态保持静止约1.2秒。' : GYRO_STATUS[signal.state] || signal.issue),
            'situpTest.tilt': signal.tilt.toFixed(1), 'situpTest.magnitude': signal.magnitudeRatio.toFixed(2), 'situpTest.auxiliary': signal.rotationAvailable ? '旋转辅助已接入' : '仅加速度' });
        },
        count: () => { if (this._visible && this.data.settingsSensor === 'motion') this.setData({ 'situpTest.count': this.data.situpTest.count + 1 }); },
        fault: (message) => { if (this._visible) this.setData({ 'situpTest.active': false, 'situpTest.state': 'FAULT', 'situpTest.status': message }); }
      });
      this._gyroTestSource = new GyroSource(wx, {
        signal: (signal) => {
          if (!this._visible || this.data.settingsSensor !== 'gyro') return;
          const at = Date.now();
          if (at - (this._gyroRenderAt || 0) < 150 && signal.state === this.data.gyroTest.state && !signal.counted) return;
          this._gyroRenderAt = at;
          this.setData({ 'gyroTest.state': signal.state, 'gyroTest.status': GYRO_STATUS[signal.state] || signal.issue,
            'gyroTest.x': signal.rates.x.toFixed(2), 'gyroTest.y': signal.rates.y.toFixed(2), 'gyroTest.z': signal.rates.z.toFixed(2),
            'gyroTest.angle': signal.angle.toFixed(2), 'gyroTest.axis': signal.axis });
        },
        count: () => { if (this._visible && this.data.settingsSensor === 'gyro') this.setData({ 'gyroTest.count': this.data.gyroTest.count + 1 }); },
        fault: (message) => { if (this._visible) this.setData({ 'gyroTest.active': false, 'gyroTest.state': 'FAULT', 'gyroTest.status': message }); }
      });
      this._activateExercise(options && options.exerciseId);
    },
    onShow() {
      this.setData({ 'gyroTest.active': false, 'gyroTest.state': 'IDLE', 'gyroTest.status': '主动开启测试；返回页面需重新校准。',
        'situpTest.active': false, 'situpTest.state': 'IDLE', 'situpTest.status': '主动开启测试；在起始姿态重新校准。' });
      this._loadGyroSettings(); this._loadSitupSettings();
    },
    onHide() { this._flushGyroSettings(false); this._flushSitupSettings(false); this._stopGyroTest(false); },
    onUnload() { this._flushGyroSettings(false); this._flushSitupSettings(false); this._stopGyroTest(false); },
    _activateExercise(id) {
      const exercise = EXERCISES.find((item) => item.id === id) || EXERCISES[0];
      this._opticalAllowed = exercise.sensor === 'optical';
      this.setData({ selectedExerciseId: exercise.id, selectedExerciseName: exercise.name, settingsSensor: exercise.sensor || 'timer',
        'optical.state': 'IDLE', 'optical.status': '主动开启相机测试，返回本运动需重新校准。', 'optical.testCount': 0,
        'situpTest.active': false, 'situpTest.state': 'IDLE', 'situpTest.status': '主动开启加速度主导检测。', 'situpTest.count': 0, 'situpTest.tilt': '—', 'situpTest.magnitude': '—', 'situpTest.auxiliary': '旋转辅助未开启',
        'gyroTest.active': false, 'gyroTest.state': 'IDLE', 'gyroTest.status': '主动开启陀螺仪测试。', 'gyroTest.count': 0,
        'gyroTest.x': '—', 'gyroTest.y': '—', 'gyroTest.z': '—', 'gyroTest.angle': '—', 'gyroTest.axis': '—' });
      this._loadGyroSettings(); this._loadSitupSettings();
    },
    onExerciseTab(event) {
      const id = event.currentTarget.dataset.id;
      if (!this._visible || id === this.data.selectedExerciseId || !EXERCISES.some((item) => item.id === id)) return;
      this._flushSettings(); this._flushGyroSettings(); this._flushSitupSettings();
      this._releaseOptical(false); this._stopGyroTest(false);
      this._activateExercise(id);
    },
    canStartOptical() { return this.data.settingsSensor === 'optical'; },
    onOpticalStarting() { this._stopGyroTest(false); },
    _loadGyroSettings() {
      if (this.data.settingsSensor !== 'gyro') return;
      this._gyroSettings = this._prefs.load().gyro[this.data.selectedExerciseId];
      this._displayGyroSettings();
    },
    _loadSitupSettings() {
      if (this.data.settingsSensor !== 'motion') return;
      this._situpSettings = this._prefs.load().situp; this._displaySitupSettings();
    },
    _displaySitupSettings() {
      this.setData({ situpSliders: situpSliders(this._situpSettings), rotationAxisIndex: this._situpSettings.rotationAxis === 'x' ? 0 : 1, storageMessage: this._prefs.warning });
      if (this._situpTestSource) this._situpTestSource.configure(this._situpSettings);
    },
    _flushSitupSettings(render) {
      if (!this._dirtySitupSettings) return;
      this._prefs.saveSitup(this._situpSettings); this._dirtySitupSettings = false;
      if (render !== false) this.setData({ storageMessage: this._prefs.warning });
    },
    _changeSitupSetting(event, save) {
      if (!this._visible || this.data.settingsSensor !== 'motion') return;
      this._situpSettings = changeSitup(this._situpSettings, event.currentTarget.dataset.key, event.detail.value);
      this._dirtySitupSettings = true; this._displaySitupSettings();
      if (save) this._flushSitupSettings();
    },
    onSitupSettingChanging(event) { this._changeSitupSetting(event, false); },
    onSitupSettingChange(event) { this._changeSitupSetting(event, true); },
    onRotationAxisChange(event) { this._changeSitupSetting({ currentTarget: { dataset: { key: 'rotationAxis' } }, detail: { value: Number(event.detail.value) === 1 ? 'auto' : 'x' } }, true); },
    resetSitupSettings() {
      if (this.data.settingsSensor !== 'motion') return;
      this._situpSettings = { ...DEFAULT_SITUP }; this._dirtySitupSettings = true; this._displaySitupSettings(); this._flushSitupSettings();
    },
    startSitupTest() {
      if (!this._visible || this.data.settingsSensor !== 'motion') return;
      this._releaseOptical(false); this._gyroTestSource.stop(); this._situpRenderAt = 0;
      this.setData({ 'situpTest.active': true, 'situpTest.state': 'CALIBRATING', 'situpTest.count': 0, 'situpTest.tilt': '—', 'situpTest.magnitude': '—', 'situpTest.auxiliary': '旋转辅助启动中', 'situpTest.status': '在起始姿态保持静止约1.2秒。' });
      this._situpTestSource.start(this._situpSettings);
    },
    stopSitupTest() {
      this._situpTestSource.stop();
      if (this._visible) this.setData({ 'situpTest.active': false, 'situpTest.state': 'IDLE', 'situpTest.status': '已停止，重新开启需在起始姿态校准。' });
    },
    _displayGyroSettings() {
      this.setData({ gyroSliders: gyroSliders(this._gyroSettings), gyroAxisIndex: this._gyroSettings.axis === 'x' ? 0 : 1, storageMessage: this._prefs.warning });
      if (this._gyroTestSource) this._gyroTestSource.configure(this._gyroSettings);
    },
    _flushGyroSettings(render) {
      if (!this._dirtyGyroSettings) return;
      this._prefs.saveGyro(this.data.selectedExerciseId, this._gyroSettings);
      this._dirtyGyroSettings = false;
      if (render !== false) this.setData({ storageMessage: this._prefs.warning });
    },
    _changeGyroSetting(event, save) {
      if (!this._visible || this.data.settingsSensor !== 'gyro') return;
      this._gyroSettings = changeGyro(this._gyroSettings, event.currentTarget.dataset.key, event.detail.value);
      this._dirtyGyroSettings = true; this._displayGyroSettings();
      if (save) this._flushGyroSettings();
    },
    onGyroSettingChanging(event) { this._changeGyroSetting(event, false); },
    onGyroSettingChange(event) { this._changeGyroSetting(event, true); },
    onGyroAxisChange(event) {
      this._changeGyroSetting({ currentTarget: { dataset: { key: 'axis' } }, detail: { value: Number(event.detail.value) === 1 ? 'auto' : 'x' } }, true);
    },
    resetGyroSettings() {
      if (this.data.settingsSensor !== 'gyro') return;
      this._gyroSettings = { ...DEFAULT_GYRO }; this._dirtyGyroSettings = true;
      this._displayGyroSettings(); this._flushGyroSettings();
    },
    startGyroTest() {
      if (!this._visible || this.data.settingsSensor !== 'gyro') return;
      this._situpTestSource.stop();
      this._releaseOptical(false); this._gyroRenderAt = 0;
      this.setData({ 'gyroTest.active': true, 'gyroTest.state': 'CALIBRATING', 'gyroTest.status': GYRO_STATUS.CALIBRATING, 'gyroTest.count': 0,
        'gyroTest.x': '—', 'gyroTest.y': '—', 'gyroTest.z': '—', 'gyroTest.angle': '—', 'gyroTest.axis': '—' });
      this._gyroTestSource.start(this._gyroSettings);
    },
    _stopGyroTest(render) {
      if (this._gyroTestSource) this._gyroTestSource.stop();
      if (this._situpTestSource) this._situpTestSource.stop();
      if (render !== false && this._visible) this.setData({ 'gyroTest.active': false, 'gyroTest.state': 'IDLE', 'gyroTest.status': '已停止；重新开启将重新校准。' });
    },
    stopGyroTest() { this._stopGyroTest(true); }
  });
}

module.exports = { createOpticalSettingsPage };
