const test = require('node:test');
const assert = require('node:assert/strict');
const { SitupFSM } = require('../miniprogram/domain/situp/fsm');
const { DEFAULT_SITUP, changeSitup, isValidSitup } = require('../miniprogram/config/situp');
const { DEFAULT_GYRO } = require('../miniprogram/config/gyro');
const { DEFAULT_OPTICAL } = require('../miniprogram/config/optical');
const { PreferencesStore, PREFERENCES_KEY } = require('../miniprogram/services/preferences');
const { TrainingStore, TRAINING_KEY } = require('../miniprogram/services/training-store');
const { createRuntime } = require('./helpers/runtime');
const { vector, situpSignal } = require('./helpers/situp-signal');
const tab = (id) => ({ currentTarget: { dataset: { id } } });
const slider = (key, value) => ({ currentTarget: { dataset: { key } }, detail: { value } });
const down = { touches: [{ clientX: 20, clientY: 100 }] };
const up = { touches: [] };

test('加速度确定完整离开/返回周期；旋转单独、抖动、单程、冲击和快速半程均不计数', () => {
  for (const kind of ['normal', 'rotation-only', 'jitter', 'oneway', 'impact', 'fast']) {
    const h = createRuntime(); const p = h.openPage('training', { exerciseId: 'sit-up', mode: 'motion' }); p.startCounting(); const s = situpSignal(h); s.calibrate();
    assert.equal(p.data.phase, 'running'); assert.equal(h.calls.accelStart, 1); assert.equal(h.calls.gyroStart, 1);
    if (kind === 'normal') { s.cycle(); s.cycle(); s.cycle(); }
    if (kind === 'rotation-only') { s.hold(0, 1200, 2); s.hold(0, 1200, -2); }
    if (kind === 'jitter') for (let i = 0; i < 60; i++) s.hold(i % 2 ? 5 : -5, 40, i % 2 ? 0.2 : -0.2);
    if (kind === 'oneway') { s.ramp(0, 60, 800); s.hold(60, 8500); }
    if (kind === 'impact') { s.hold(60, 1000, 2, 3); s.hold(0, 1000, -2, 3); s.hold(0, 800); }
    if (kind === 'fast') { s.hold(60, 120, 3); s.hold(0, 120, -3); s.hold(0, 800); }
    assert.equal(p.data.count, kind === 'normal' ? 3 : 0, kind);
    p.onUnload(); assert.equal(h.accelListeners.size, 0); assert.equal(h.gyroListeners.size, 0); assert.equal(h.timers.size, 0);
  }
});

test('旋转辅助有信号时要求双向佐证；不支持/失败/中断时明确提示仅加速度且清除半周期', () => {
  for (const options of [{}, { gyroFails: true }, { unsupportedApis: ['startGyroscope'] }]) {
    const h = createRuntime(options); const p = h.openPage('training', { exerciseId: 'sit-up', mode: 'motion' }); p.startCounting(); const s = situpSignal(h); s.calibrate();
    if (!options.gyroFails && !options.unsupportedApis) {
      s.ramp(0, 60, 800, 0); s.hold(60, 300); s.ramp(60, 0, 800, 0); s.hold(0, 800);
      assert.equal(p.data.count, 0, '旋转接口有效但没有往返佐证则拒绝');
    } else assert.match(p.data.notice, /仅使用加速度/);
    s.cycle(); assert.equal(p.data.count, 1); p.onUnload();
  }
  const h = createRuntime(); const p = h.openPage('training', { exerciseId: 'sit-up', mode: 'motion' }); p.startCounting(); const s = situpSignal(h); s.calibrate();
  s.ramp(0, 60, 800); s.hold(60, 300);
  for (let i = 0; i < 80; i++) { h.accel(vector(60)); h.advance(20); }
  assert.match(p.data.notice, /旋转信号中断/); assert.equal(p._motion.fsm.rotationAvailable, false);
  s.hold(0, 800); assert.equal(p.data.count, 0); s.cycle(); assert.equal(p.data.count, 1); p.onUnload();
});

test('半周期触屏后超600ms再完成也不重复计数；触屏继续并行，旋转不单独进入统一计数器', () => {
  const h = createRuntime(); const p = h.openPage('training', { exerciseId: 'sit-up', mode: 'motion' }); p.startCounting(); const s = situpSignal(h); s.calibrate();
  s.ramp(0, 40, 600); assert.equal(p._motion.fsm.state, 'OUT');
  p.onTouchStart(down); p.onTouchEnd(up); assert.equal(p.data.count, 1);
  s.ramp(40, 60, 400); s.hold(60, 300); s.ramp(60, 0, 800); s.hold(0, 800);
  assert.equal(p.data.count, 1); assert.equal(h.accelListeners.size, 1); assert.equal(h.gyroListeners.size, 1);
  s.cycle(); assert.equal(p.data.count, 2); p.pauseCounting(); p.startCounting();
  assert.equal(p.data.phase, 'calibrating'); assert.equal(p.data.count, 2); s.calibrate(); s.cycle(); assert.equal(p.data.count, 3);
  p.onUnload(); const saved = new TrainingStore(h.wx).snapshot(); assert.ok(Object.values(saved.results).some((r) => r.modes.includes('motion')));
});

test('主加速度失败/缺接口/无信号降级触屏；校准时间不累计，后台同时释放两个监听', () => {
  for (const options of [{ accelFails: true }, { unsupportedApis: ['offAccelerometerChange'] }, {}]) {
    const h = createRuntime(options); const p = h.openPage('training', { exerciseId: 'sit-up', mode: 'motion' }); p.startCounting(); h.advance(3500);
    assert.equal(p.data.selectedMode, 'touch'); assert.match(p.data.notice, /加速度/); assert.equal(h.accelListeners.size, 0); assert.equal(h.gyroListeners.size, 0);
    p.onUnload(); assert.equal(h.timers.size, 0);
  }
  const h = createRuntime(); const p = h.openPage('training', { exerciseId: 'sit-up', mode: 'motion' }); p.startCounting(); const s = situpSignal(h); s.calibrate();
  assert.equal(p._session.activeMs, 0); s.hold(0, 1000); p.onHide();
  assert.equal(h.accelListeners.size, 0); assert.equal(h.gyroListeners.size, 0); assert.equal(h.timers.size, 0);
  const starts = h.calls.accelStart; p.onShow(); assert.equal(p.data.phase, 'paused'); assert.equal(h.calls.accelStart, starts); p.onUnload();
});

test('延迟加速度/旋转启动、旧事件在切标签和卸载后不能复活；新深蹲会话不被旧回调停止', () => {
  const h = createRuntime({ delayAccel: true, delayGyro: true }); const p = h.openPage('settings'); p.onExerciseTab(tab('sit-up')); p.startSitupTest();
  const oldAccel = [...h.accelListeners][0], oldGyro = [...h.gyroListeners][0]; p.onExerciseTab(tab('squat')); p.startGyroTest();
  const stopped = h.calls.gyroStop, accelStopped = h.calls.accelStop; h.accelStarts[0].success(); h.gyroStarts[0].success(); oldAccel(vector(60)); oldGyro({ x: 10, y: 0, z: 0 });
  assert.equal(h.calls.accelStop, accelStopped + 1, '新深蹲不使用加速度，旧延迟启动必须再次停止');
  assert.equal(h.calls.gyroStop, stopped); assert.equal(h.accelListeners.size, 0); assert.equal(h.gyroListeners.size, 1);
  h.gyroStarts[1].success(); p.onUnload(); p.setData = () => assert.fail('卸载后不可更新');
  h.accelStarts[0].success(); h.accelStarts[0].fail(); h.gyroStarts[0].success(); h.gyroStarts[0].fail();
  assert.equal(h.accelListeners.size, 0); assert.equal(h.gyroListeners.size, 0); assert.equal(h.timers.size, 0);
});

test('实时调参保留基准清半周期，松手保存，返回训练使用新参数；新阈值影响检测', () => {
  const h = createRuntime(); const p = h.openPage('calibration', { exerciseId: 'sit-up' }); p.startSitupTest(); const s = situpSignal(h); s.calibrate(); s.ramp(0, 60, 800);
  const baseline = { ...p._situpTestSource.fsm.baseline };
  p.onSitupSettingChanging(slider('outAngle', 70)); p.onSitupSettingChanging(slider('outAngle', 75));
  assert.equal(h.calls.writes, 0); assert.equal(h.calls.accelStart, 1); assert.equal(h.calls.gyroStart, 1); assert.deepEqual({ ...p._situpTestSource.fsm.baseline }, baseline);
  p.onSitupSettingChange(slider('outAngle', 75)); assert.equal(h.calls.writes, 1);
  s.ramp(60, 0, 800); s.hold(0, 800); s.cycle(); assert.equal(p.data.situpTest.count, 0);
  p.onSitupSettingChange(slider('outAngle', 35)); s.hold(0, 500); s.cycle(); assert.equal(p.data.situpTest.count, 1);
  p.onRotationAxisChange({ detail: { value: 1 } }); p.onSitupSettingChanging(slider('stableMs', 200)); p.onHide();
  assert.equal(h.storage.get(PREFERENCES_KEY).situp.stableMs, 200); assert.equal(h.accelListeners.size, 0); p.onUnload();
  const training = h.openPage('training', { exerciseId: 'sit-up', mode: 'motion' }); training.startCounting();
  assert.equal(training._motion.fsm.config.stableMs, 200); assert.equal(training._motion.fsm.config.rotationAxis, 'auto'); training.onUnload();
  const reset = h.openPage('settings'); reset.onExerciseTab(tab('sit-up')); reset.resetSitupSettings(); reset.onUnload();
  assert.deepEqual(new PreferencesStore(h.wx).load().situp, DEFAULT_SITUP);
});

test('仰卧起坐调参往返保留训练完成量和排序，既有深蹲参数不受影响', () => {
  const h = createRuntime(); const prefs = new PreferencesStore(h.wx); prefs.setSortMode('recent'); prefs.saveGyro('squat', { ...DEFAULT_GYRO, minRate: 0.9 });
  const p = h.openPage('training', { exerciseId: 'sit-up' }); p.startCounting(); p.manualAdd(); p.onHide();
  const settings = h.openPage('calibration', { exerciseId: 'sit-up' }); settings.onSitupSettingChange(slider('outAngle', 50)); settings.onUnload();
  p.onShow(); assert.equal(p.data.count, 1); assert.equal(p.data.phase, 'paused'); p.selectSensorMode(); p.startCounting();
  assert.equal(p._motion.fsm.config.outAngle, 50); assert.equal(p.data.count, 1); p.onUnload();
  const value = new PreferencesStore(h.wx).load(); assert.equal(value.gyro.squat.minRate, 0.9); assert.equal(value.sortMode, 'recent');
});

test('v3迁移保留旧参数并补加速度参数；v4损坏/未来版本不能覆盖，滑块保持迟滞和边界', () => {
  const old = { schemaVersion: 3, optical: DEFAULT_OPTICAL, gyro: { 'sit-up': { ...DEFAULT_GYRO, axis: 'auto', cooldownMs: 1200 }, squat: { ...DEFAULT_GYRO, minRate: 0.9 } }, recentExerciseIds: ['sit-up'], usageMs: { 'sit-up': 5000 }, sortMode: 'recent' };
  const h = createRuntime({ storage: new Map([[PREFERENCES_KEY, old]]) }); const store = new PreferencesStore(h.wx); const value = store.load();
  assert.equal(value.schemaVersion, 4); assert.equal(h.calls.writes, 0); assert.equal(value.situp.rotationAxis, 'auto'); assert.equal(value.situp.cooldownMs, 1200);
  assert.equal(value.gyro.squat.minRate, 0.9); assert.equal(value.usageMs['sit-up'], 5000); assert.equal(value.sortMode, 'recent');
  store.saveSitup({ ...value.situp, raw: [1] }); assert.equal(h.storage.get(PREFERENCES_KEY).situp.raw, undefined);
  for (const bad of [{ ...value, schemaVersion: 5 }, { ...value, situp: { ...DEFAULT_SITUP, outAngle: 1 } }]) {
    const b = createRuntime({ storage: new Map([[PREFERENCES_KEY, bad]]) }); const p = b.openPage('settings'); p.onExerciseTab(tab('sit-up')); p.onSitupSettingChange(slider('outAngle', 50)); p.onUnload();
    assert.equal(b.calls.writes, 0); assert.deepEqual(b.storage.get(PREFERENCES_KEY), bad);
  }
  let config = { ...DEFAULT_SITUP };
  for (const key of Object.keys(DEFAULT_SITUP).filter((key) => key !== 'rotationAxis')) for (const input of [-500, 0, 10, 80, 500, 99999, NaN]) { config = changeSitup(config, key, input); assert.ok(isValidSitup(config), key); }
});

test('断流重新校准、校准晃动/零向量/非法时间不计数，调参不接续旧周期', () => {
  const f = new SitupFSM();
  for (let at = 0; at < 1400; at += 20) f.feedAcceleration(vector(0), at);
  assert.equal(f.state, 'READY'); assert.equal(f.feedAcceleration(vector(60), 3000).state, 'CALIBRATING');
  assert.equal(f.feedAcceleration({ x: NaN, y: 0, z: 1 }, 3020).counted, false);
  assert.equal(f.feedAcceleration(vector(0), 3000).counted, false);
  const moving = new SitupFSM(); for (let at = 0; at < 1400; at += 20) moving.feedAcceleration(vector(at % 40 ? 50 : 0), at);
  assert.equal(moving.state, 'FAULT'); assert.throws(() => f.configure({ outAngle: 5 }), /INVALID_SITUP/);
  const empty = new SitupFSM(); for (let at = 0; at < 1600; at += 20) assert.equal(empty.feedAcceleration({ x: 0, y: 0, z: 0 }, at).counted, false);
});

test('辅助启动超时后迟到成功仍停止；主加速度中断/异常释放双传感器，恢复需重新校准', () => {
  const h = createRuntime({ delayGyro: true }); const p = h.openPage('training', { exerciseId: 'sit-up', mode: 'motion' }); p.startCounting(); const s = situpSignal(h);
  s.calibrate(); s.hold(0, 1000); assert.match(p.data.notice, /旋转启动超时/);
  const stopped = h.calls.gyroStop; h.gyroStarts[0].success(); assert.equal(h.calls.gyroStop, stopped + 1); assert.equal(h.gyroListeners.size, 0);
  s.cycle(); assert.equal(p.data.count, 1); h.advance(3500);
  assert.equal(p.data.selectedMode, 'touch'); assert.equal(p.data.count, 1); assert.equal(h.accelListeners.size, 0); p.onUnload(); assert.equal(h.timers.size, 0);
  const bad = createRuntime(); const q = bad.openPage('training', { exerciseId: 'sit-up', mode: 'motion' }); q.startCounting(); bad.accel({ x: NaN, y: 0, z: 0 });
  assert.equal(q.data.selectedMode, 'touch'); assert.equal(bad.gyroListeners.size, 0); assert.equal(bad.accelListeners.size, 0); q.onUnload();
});

test('重启中的新仰卧起坐不被旧成功回调停止，连续启停每种监听仅一个', () => {
  const h = createRuntime({ delayAccel: true, delayGyro: true }); const p = h.openPage('settings'); p.onExerciseTab(tab('sit-up'));
  p.startSitupTest(); p.startSitupTest(); const accelStopped = h.calls.accelStop, gyroStopped = h.calls.gyroStop;
  h.accelStarts[0].success(); h.gyroStarts[0].success();
  assert.equal(h.calls.accelStop, accelStopped); assert.equal(h.calls.gyroStop, gyroStopped);
  h.accelStarts[1].success(); h.gyroStarts[1].success();
  assert.equal(h.accelListeners.size, 1); assert.equal(h.gyroListeners.size, 1); const s = situpSignal(h); s.calibrate(); s.cycle(); assert.equal(p.data.situpTest.count, 1);
  p.onUnload(); assert.equal(h.accelListeners.size, 0); assert.equal(h.gyroListeners.size, 0); assert.equal(h.timers.size, 0);
});

test('融合计数到达计划目标自动休息并释放两种硬件，半周期去重保持组进度', () => {
  const h = createRuntime(); new TrainingStore(h.wx).saveAssessment('sit-up', 10, h.now());
  const p = h.openPage('training', { exerciseId: 'sit-up', purpose: 'plan', mode: 'motion' }); p.onTargetInput({ detail: { value: '1' } }); p.applyTarget(); p.startCounting();
  const s = situpSignal(h); s.calibrate(); s.cycle(); assert.equal(p._session.state, 'rest'); assert.equal(p._session.groups[0].actual, 1);
  assert.equal(h.accelListeners.size, 0); assert.equal(h.gyroListeners.size, 0); assert.match(h.redirects.at(-1), /pages\/rest/);
  p.onHide(); p.onUnload(); assert.equal(h.timers.size, 0);
});
