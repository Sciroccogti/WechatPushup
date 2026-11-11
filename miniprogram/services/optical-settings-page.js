const { APP_INFO } = require('../config/app');
const { withOpticalPage } = require('./optical-page');
const { EXERCISES } = require('../config/exercises');
const { DEFAULT_GYRO, GYRO_AXES, changeGyro, gyroSliders } = require('../config/gyro');
const { GyroSource } = require('./gyro-source');

const GYRO_STATUS = { CALIBRATING: '请保持手机静止约 1.2 秒。', READY: '可以开始一个完整往返周期。', OUT: '已检测到转动，等待反向。', BACK: '正在确认返回。', COUNT: '完整周期已计数。', SETTLE: '请短暂静止，再开始下一个周期。' };

function createOpticalSettingsPage() {
  return withOpticalPage({
    allowSimulation: true,
    data: { appName: APP_INFO.name, version: APP_INFO.version, sortOptions: ['累计训练时长', '最近使用'], sortIndex: 0,
      exerciseTabs: EXERCISES, selectedExerciseId: 'push-up', selectedExerciseName: '俯卧撑', settingsSensor: 'optical',
      gyroAxes: GYRO_AXES, gyroAxisIndex: 0, gyroSliders: gyroSliders(DEFAULT_GYRO),
      gyroTest: { active: false, state: 'IDLE', status: '主动开启陀螺仪测试。', x: '—', y: '—', z: '—', angle: '—', axis: '—', count: 0 } },
    onLoad(options) {
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
      const value = this._prefs.load();
      this.setData({ sortIndex: value.sortMode === 'duration' ? 0 : 1, 'gyroTest.active': false, 'gyroTest.state': 'IDLE', 'gyroTest.status': '主动开启测试；返回页面需重新校准。' });
      this._loadGyroSettings();
    },
    onHide() { this._flushGyroSettings(false); this._stopGyroTest(false); },
    onUnload() { this._flushGyroSettings(false); this._stopGyroTest(false); },
    _activateExercise(id) {
      const exercise = EXERCISES.find((item) => item.id === id) || EXERCISES[0];
      this._opticalAllowed = exercise.sensor === 'optical';
      this.setData({ selectedExerciseId: exercise.id, selectedExerciseName: exercise.name, settingsSensor: exercise.sensor || 'timer',
        'optical.state': 'IDLE', 'optical.status': '主动开启相机测试，返回本运动需重新校准。', 'optical.testCount': 0,
        'gyroTest.active': false, 'gyroTest.state': 'IDLE', 'gyroTest.status': '主动开启陀螺仪测试。', 'gyroTest.count': 0,
        'gyroTest.x': '—', 'gyroTest.y': '—', 'gyroTest.z': '—', 'gyroTest.angle': '—', 'gyroTest.axis': '—' });
      this._loadGyroSettings();
    },
    onExerciseTab(event) {
      const id = event.currentTarget.dataset.id;
      if (!this._visible || id === this.data.selectedExerciseId || !EXERCISES.some((item) => item.id === id)) return;
      this._flushSettings(); this._flushGyroSettings();
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
      this._releaseOptical(false); this._gyroRenderAt = 0;
      this.setData({ 'gyroTest.active': true, 'gyroTest.state': 'CALIBRATING', 'gyroTest.status': GYRO_STATUS.CALIBRATING, 'gyroTest.count': 0,
        'gyroTest.x': '—', 'gyroTest.y': '—', 'gyroTest.z': '—', 'gyroTest.angle': '—', 'gyroTest.axis': '—' });
      this._gyroTestSource.start(this._gyroSettings);
    },
    _stopGyroTest(render) {
      if (this._gyroTestSource) this._gyroTestSource.stop();
      if (render !== false && this._visible) this.setData({ 'gyroTest.active': false, 'gyroTest.state': 'IDLE', 'gyroTest.status': '已停止；重新开启将重新校准。' });
    },
    stopGyroTest() { this._stopGyroTest(true); },
    onSortChange(event) { this._prefs.setSortMode(Number(event.detail.value) === 0 ? 'duration' : 'recent'); this.setData({ sortIndex: Number(event.detail.value), storageMessage: this._prefs.warning }); }
  });
}

module.exports = { createOpticalSettingsPage };
