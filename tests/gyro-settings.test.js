const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_GYRO, GYRO_EXERCISES, isValidGyro, changeGyro } = require('../miniprogram/config/gyro');
const { DEFAULT_OPTICAL } = require('../miniprogram/config/optical');
const { PreferencesStore, PREFERENCES_KEY } = require('../miniprogram/services/preferences');
const { GyroFSM } = require('../miniprogram/domain/gyro/fsm');
const { createRuntime } = require('./helpers/runtime');
const tab = (id) => ({ currentTarget: { dataset: { id } } });
const slider = (key, value) => ({ currentTarget: { dataset: { key } }, detail: { value } });
function hold(h, x, ms) { for (let at = 0; at < ms; at += 20) { h.gyro({ x, y: 0, z: 0 }); h.advance(20); } }
function cycle(h) { for (const [x, ms] of [[1, 700], [0, 200], [-1, 700], [0, 800]]) hold(h, x, ms); }

test('偏好v1/v2迁移保留光学/排序/时长，两个运动陀螺仪参数独立且仅保存公开字段', () => {
  for (const schemaVersion of [1, 2]) {
    const old = { schemaVersion, optical: { ...DEFAULT_OPTICAL, darkRatio: 0.7 }, recentExerciseIds: ['squat'], usageMs: { squat: 1234 }, sortMode: 'recent' };
    const h = createRuntime({ storage: new Map([[PREFERENCES_KEY, old]]) }); const store = new PreferencesStore(h.wx);
    const value = store.load(); assert.equal(value.schemaVersion, 4); assert.equal(h.calls.writes, 0);
    assert.equal(value.optical.darkRatio, 0.7); assert.deepEqual(value.recentExerciseIds, ['squat']);
    assert.equal(value.sortMode, schemaVersion === 1 ? 'duration' : 'recent');
    assert.equal(value.usageMs.squat || 0, schemaVersion === 1 ? 0 : 1234);
    store.saveGyro('sit-up', { ...DEFAULT_GYRO, minRate: 0.8, baseline: 123, samples: [1] });
    const saved = new PreferencesStore(h.wx).load();
    assert.equal(saved.gyro['sit-up'].minRate, 0.8); assert.deepEqual(saved.gyro.squat, DEFAULT_GYRO);
    assert.deepEqual(Object.keys(saved.gyro['sit-up']).sort(), Object.keys(DEFAULT_GYRO).sort());
    assert.equal(saved.optical.darkRatio, 0.7); assert.equal(h.storage.get(PREFERENCES_KEY).schemaVersion, 4);
  }
});

test('损坏陀螺仪/未来版本锁定写入，所有滑块输入保持边界且非法配置被拒绝', () => {
  const fresh = new PreferencesStore(createRuntime().wx).load();
  for (const invalid of [{ ...fresh, schemaVersion: 5 }, { ...fresh, gyro: { 'sit-up': DEFAULT_GYRO } }, { ...fresh, gyro: { ...fresh.gyro, squat: { ...DEFAULT_GYRO, alpha: NaN } } }]) {
    const h = createRuntime({ storage: new Map([[PREFERENCES_KEY, invalid]]) }); const store = new PreferencesStore(h.wx); store.load();
    assert.equal(store.saveGyro('sit-up', DEFAULT_GYRO), false); assert.equal(h.calls.writes, 0);
    assert.deepEqual(h.storage.get(PREFERENCES_KEY), invalid); assert.ok(store.warning);
  }
  let value = { ...DEFAULT_GYRO };
  for (const key of Object.keys(DEFAULT_GYRO).filter((key) => key !== 'axis')) for (const input of [-100, 0, 30, 100, 300, 50000, NaN]) {
    value = changeGyro(value, key, input); assert.ok(isValidGyro(value), key);
  }
  assert.throws(() => new GyroFSM({ minRate: -1 }), /INVALID_GYRO/);
  assert.throws(() => new GyroFSM().configure({ axis: 'y' }), /INVALID_GYRO/);
});

test('设置中陀螺仪边测边调保留校准且清除半周期；松手才保存，后续完整周期按新阈值计数', () => {
  const h = createRuntime(); const page = h.openPage('settings'); page.onExerciseTab(tab('squat'));
  assert.equal(h.calls.gyroStart, 0); assert.equal(h.calls.camera, 0);
  page.startGyroTest(); hold(h, 0, 1400); hold(h, 1, 700);
  const bias = { ...page._gyroTestSource.fsm.bias }; assert.equal(page._gyroTestSource.fsm.state, 'OUT');
  page.onGyroSettingChanging(slider('minRate', 60)); page.onGyroSettingChanging(slider('minRate', 70));
  assert.equal(page._gyroTestSource.fsm.config.minRate, 0.7); assert.deepEqual({ ...page._gyroTestSource.fsm.bias }, bias);
  assert.equal(h.calls.gyroStart, 1); assert.equal(h.calls.gyroStop, 0); assert.equal(h.calls.writes, 0);
  page.onGyroSettingChange(slider('minRate', 70)); assert.equal(h.calls.writes, 1);
  hold(h, -1, 700); hold(h, 0, 800); assert.equal(page.data.gyroTest.count, 0);
  cycle(h); assert.equal(page.data.gyroTest.count, 1);
  assert.equal(h.storage.get(PREFERENCES_KEY).gyro.squat.minRate, 0.7);
  page.onUnload(); assert.equal(h.timers.size, 0); assert.equal(h.gyroListeners.size, 0);
});

test('新阈值确实影响检测：高速度阈值忽略低幅信号，调低后完整周期才计数', () => {
  const h = createRuntime(); const page = h.openPage('calibration', { exerciseId: 'squat' });
  assert.equal(page.data.selectedExerciseId, 'squat');
  page.onGyroSettingChange(slider('minRate', 200)); page.startGyroTest(); hold(h, 0, 1400); cycle(h);
  assert.equal(page.data.gyroTest.count, 0);
  page.onGyroSettingChange(slider('minRate', 40)); hold(h, 0, 800); cycle(h);
  assert.equal(page.data.gyroTest.count, 1); page.onUnload();
});

test('切换标签保存旧运动参数并释放硬件；相机延迟授权和旧陀螺仪启动不能跨标签复活', () => {
  const h = createRuntime({ delayAuthorize: true, delayGyro: true }); const page = h.openPage('settings');
  page.startOptical(); page.onExerciseTab(tab('squat')); h.authorizations[0].success();
  assert.equal(page.data.optical.mounted, false); assert.equal(h.calls.camera, 0);
  page.startGyroTest(); const oldListener = [...h.gyroListeners][0];
  page.onGyroSettingChanging(slider('minAngle', 50)); page.onExerciseTab(tab('push-up'));
  assert.equal(h.storage.get(PREFERENCES_KEY).gyro.squat.minAngle, 0.5);
  assert.equal(page.data.settingsSensor, 'optical'); assert.equal(h.gyroListeners.size, 0);
  h.gyroStarts[0].success(); oldListener({ x: 1, y: 0, z: 0 });
  assert.equal(page.data.gyroTest.active, false); assert.equal(page.data.gyroTest.count, 0); assert.equal(h.timers.size, 0);
  page.onExerciseTab(tab('plank')); page.startGyroTest(); page.startOptical(); page.startOpticalSimulation();
  assert.equal(h.calls.gyroStart, 1); assert.equal(h.calls.privacy, 1); assert.equal(h.timers.size, 0);
  page.onUnload();
});

test('后台/卸载保存拖动值并停止测试；恢复不自动采集，卸载后旧回调不得更新视图', () => {
  const h = createRuntime({ delayGyro: true }); const page = h.openPage('settings'); page.onExerciseTab(tab('squat'));
  page.startGyroTest(); page.onGyroSettingChanging(slider('stableMs', 200)); page.onHide();
  assert.equal(h.storage.get(PREFERENCES_KEY).gyro.squat.stableMs, 200); assert.equal(h.gyroListeners.size, 0);
  page.onShow(); assert.equal(page.data.gyroTest.active, false); assert.equal(h.calls.gyroStart, 1);
  page.startGyroTest(); page.onUnload(); page.setData = () => assert.fail('卸载后不能更新视图');
  for (const start of h.gyroStarts) { start.success(); start.fail(); }
  assert.equal(h.timers.size, 0); assert.equal(h.gyroListeners.size, 0);
});

test('活动相机与陀螺仪切换互斥，旧采集回调不污染新标签，重新进入需主动启动', () => {
  const h = createRuntime(); const page = h.openPage('settings'); page.startOptical(); page.onCameraReady();
  const oldFrame = h.frames[0]; assert.equal(page.data.optical.active, true);
  page.onExerciseTab(tab('squat')); assert.equal(h.calls.stop, 1); assert.equal(page.data.optical.active, false);
  page.startGyroTest(); hold(h, 0, 1400); cycle(h); assert.equal(page.data.gyroTest.count, 1);
  const oldGyro = [...h.gyroListeners][0]; oldFrame({}); assert.equal(page.data.settingsSensor, 'gyro');
  page.onExerciseTab(tab('push-up')); oldGyro({ x: NaN, y: 0, z: 0 });
  assert.equal(h.gyroListeners.size, 0); assert.equal(h.calls.gyroStop, 1); assert.equal(h.timers.size, 0);
  assert.equal(page.data.optical.state, 'IDLE'); assert.equal(page.data.optical.mounted, false);
  assert.equal(page.data.gyroTest.count, 0); page.onUnload();
});

test('调参返回后训练使用对应运动的新参数，保留完成量；重置不改另一个运动', () => {
  for (const id of ['squat']) {
    const h = createRuntime(); const training = h.openPage('training', { exerciseId: id });
    training.startCounting(); training.manualAdd(); training.pauseCounting(); training.onHide();
    const settings = h.openPage('calibration', { exerciseId: id });
    settings.onGyroSettingChange(slider('minRate', 85)); settings.onGyroSettingChange(slider('alpha', 50));
    settings.onGyroAxisChange({ detail: { value: 1 } }); settings.onUnload();
    training.onShow(); assert.equal(training.data.count, 1); assert.equal(training.data.phase, 'paused');
    training.selectSensorMode(); assert.equal(h.calls.gyroStart, 0, '选方式不启动，点击开始才启动');
    training.startCounting(); assert.equal(training._gyro.fsm.config.minRate, 0.85); assert.equal(training._gyro.fsm.config.alpha, 0.5); assert.equal(training._gyro.fsm.config.axis, 'auto');
    assert.equal(training.data.count, 1); training.onUnload();
    const reset = h.openPage('settings'); reset.onExerciseTab(tab(id)); reset.resetGyroSettings(); reset.onUnload();
    const saved = new PreferencesStore(h.wx).load();
    for (const key of GYRO_EXERCISES) assert.deepEqual(saved.gyro[key], DEFAULT_GYRO);
  }
});
