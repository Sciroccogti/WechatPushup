const test = require('node:test');
const assert = require('node:assert/strict');
const { createRuntime } = require('./helpers/runtime');
const { buildSignal } = require('../miniprogram/domain/optical/signals');
const { PREFERENCES_KEY } = require('../miniprogram/services/preferences');
const slider = (key, value) => ({ currentTarget: { dataset: { key } }, detail: { value } });

test('设置页不会自动开相机，主动授权+initdone后取帧，模拟RGBA链路得到3次', () => {
  const h = createRuntime(); const page = h.openPage('settings');
  assert.equal(h.calls.camera, 0); assert.equal(h.calls.privacy, 0);
  page.startOptical();
  assert.equal(page.data.optical.mounted, true); assert.equal(h.calls.camera, 0);
  page.onCameraReady(); page.onCameraReady();
  assert.equal(h.calls.camera, 1);
  for (const sample of buildSignal('normal')) { h.emit(sample.value); h.advance(100); }
  assert.equal(page.data.optical.testCount, 3);
  assert.equal(page.data.optical.baseline, '160.0');
  assert.equal(h.calls.writes, 0); // 帧和信号不写入本地存储。
  page.onUnload(); assert.equal(h.timers.size, 0); assert.equal(h.calls.stop, 1);
});

test('边拖边调不重开相机/不丢基准，松手只保存一次，不承接修改前半周期', () => {
  const h = createRuntime(); const page = h.openPage('settings'); page.startOptical(); page.onCameraReady();
  h.hold(160, 3500); h.hold(20, 500);
  assert.equal(page.data.optical.state, 'DARK');
  page.onSettingChanging(slider('darkRatio', 66));
  page.onSettingChanging(slider('darkRatio', 70));
  assert.equal(h.calls.writes, 0); assert.equal(h.calls.camera, 1); assert.equal(h.calls.stop, 0);
  assert.equal(page._fsm.baseline, 160);
  page.onSettingChange(slider('darkRatio', 70));
  assert.equal(h.calls.writes, 1);
  h.hold(160, 800); assert.equal(page.data.optical.testCount, 0);
  h.hold(20, 1000); h.hold(160, 1500); assert.equal(page.data.optical.testCount, 1);
  assert.equal(h.storage.get(PREFERENCES_KEY).optical.darkRatio, 0.7);
  page.onHide(); assert.equal(h.calls.stop, 1);
  page.onShow(); assert.equal(page.data.optical.mounted, false); assert.equal(page.data.optical.darkPercent, 70);
  page.onUnload(); assert.equal(h.timers.size, 0);
});

test('光学校准不接收触屏、暂停保留次数、继续光学重新校准', () => {
  const h = createRuntime(); const page = h.openPage('training', { exerciseId: 'push-up' });
  page.startCounting(); page.onTouchStart({ touches: [{}] }); page.onTouchEnd({ touches: [] });
  assert.equal(page.data.count, 1);
  page.startOptical(); page.onCameraReady();
  page.onTouchStart({ touches: [{}] });
  assert.equal(page.data.count, 1);
  for (const sample of buildSignal('normal')) { h.emit(sample.value); h.advance(100); }
  assert.equal(page.data.count, 4);
  const oldFrame = h.frames[0];
  page.pauseCounting(); page.manualAdd(); oldFrame({});
  assert.equal(page.data.count, 4); assert.equal(h.timers.size, 1); // 页面训练刷新仍在，相机定时器已清理。
  page.startCounting(); page.onCameraReady();
  assert.equal(h.calls.camera, 2); assert.equal(page.data.optical.state, 'CALIBRATING');
  h.hold(160, 3500); assert.equal(page.data.count, 4);
  page.selectTouch(); assert.equal(h.calls.stop, 2);
  page.onTouchStart({ touches: [{}] }); assert.equal(page.data.count, 5);
  page.onUnload(); assert.equal(h.timers.size, 0);
});

test('进入调参页暂停训练，返回载入新参数并保留原计数', () => {
  const h = createRuntime(); const training = h.openPage('training', { exerciseId: 'push-up' });
  training.startCounting(); training.manualAdd(); training.onHide();
  const calibration = h.openPage('calibration');
  calibration.onSettingChange(slider('darkRatio', 72)); calibration.onUnload();
  training.onShow();
  assert.equal(training.data.count, 1); assert.equal(training.data.phase, 'paused');
  assert.equal(training._settings.darkRatio, 0.72);
  training.startOptical(); training.onCameraReady();
  assert.equal(training._fsm.config.darkRatio, 0.72);
  training.onUnload(); assert.equal(h.timers.size, 0);
});

test('权限拒绝、无帧和异常帧都降级触屏，已计次数不丢失', () => {
  for (const options of [{ denyPrivacy: true }, {}, { noContext: true }, { startFails: true }]) {
    const h = createRuntime(options); const page = h.openPage('training', { exerciseId: 'push-up' });
    page.startCounting(); page.manualAdd(); page.startOptical();
    if (!options.denyPrivacy) page.onCameraReady();
    if (page.data.optical.active) h.advance(3500);
    assert.equal(page.data.selectedMode, 'touch'); assert.equal(page.data.phase, 'running');
    assert.equal(page.data.count, 1); assert.equal(page.data.optical.mounted, false);
    assert.ok(page.data.notice); page.manualAdd(); assert.equal(page.data.count, 2);
    page.onUnload(); assert.equal(h.timers.size, 0);
  }
  const h = createRuntime(); const page = h.openPage('training', { exerciseId: 'push-up' });
  page.startOptical(); page.onCameraReady(); h.frames[0]({});
  assert.equal(page.data.selectedMode, 'touch'); page.onUnload();
});

test('长遮挡/暗光在设置页继续显示信号但不计数，重校准后可恢复', () => {
  const h = createRuntime(); const page = h.openPage('settings'); page.startOptical(); page.onCameraReady();
  h.hold(5, 4000);
  assert.equal(page.data.optical.state, 'FAULT'); assert.equal(page.data.optical.mounted, true);
  h.hold(160, 1000); assert.equal(page.data.optical.raw, '160.0'); assert.equal(page.data.optical.testCount, 0);
  page.recalibrateOptical(); h.hold(160, 3500);
  assert.equal(page.data.optical.state, 'READY');
  page.onUnload();
});

test('后台/卸载/切触屏使旧帧与延迟授权、延迟视图回调失效', () => {
  const pending = createRuntime({ delayAuthorize: true }); const page = pending.openPage('settings');
  page.startOptical(); page.onHide(); pending.authorizations[0].success();
  assert.equal(page.data.optical.mounted, false); assert.equal(pending.timers.size, 0);
  page.onUnload(); page.setData = () => assert.fail('No setData after unload');
  pending.authorizations[0].success(); pending.authorizations[0].fail();
  const delayed = createRuntime({ delayView: true }); const view = delayed.openPage('settings');
  view.startOptical(); view.stopOptical(); delayed.viewCallbacks.shift()();
  assert.equal(view.data.optical.mounted, false); view.onUnload();
  const active = createRuntime(); const camera = active.openPage('settings'); camera.startOptical(); camera.onCameraReady();
  camera.onHide(); active.frames[0]({}); assert.equal(active.calls.stop, 1);
  camera.onShow(); assert.equal(camera.data.optical.mounted, false); camera.onUnload();
});

test('延迟start成功再次停止，旧原生camera事件不能终止新会话', () => {
  const delayed = createRuntime({ delayStart: true }); const page = delayed.openPage('settings');
  page.startOptical(); page.onCameraReady(); page.stopOptical(); delayed.starts[0].success();
  assert.equal(delayed.calls.stop, 2); assert.equal(page.data.optical.active, false); page.onUnload();
  const h = createRuntime(); const camera = h.openPage('settings'); camera.startOptical();
  const old = { currentTarget: { dataset: { session: camera.data.optical.cameraEpoch } } };
  camera.onCameraReady(); camera.startOptical();
  camera.onCameraStop(old); camera.onCameraError(old); camera.onCameraReady(old);
  assert.equal(camera.data.optical.mounted, true); assert.equal(h.calls.camera, 1);
  camera.onCameraReady(); assert.equal(h.calls.camera, 2); camera.onUnload();
});

test('隐私弹窗由真实同意事件继续授权，拒绝或后台取消不会复活相机', () => {
  const h = createRuntime({ needsPrivacy: true }); h.launchApp(); const page = h.openPage('settings');
  page.startOptical(); assert.equal(page.data.optical.privacyVisible, true);
  assert.equal(page.data.optical.mounted, false);
  page.agreePrivacy(); assert.equal(page.data.optical.mounted, true);
  page.onCameraReady(); page.onHide(); page.onUnload(); assert.equal(h.timers.size, 0);
  const rejected = createRuntime({ needsPrivacy: true }); rejected.launchApp();
  const training = rejected.openPage('training', { exerciseId: 'push-up' });
  training.startOptical(); training.rejectPrivacy();
  assert.equal(training.data.selectedMode, 'touch'); assert.equal(training.data.optical.mounted, false);
  training.onUnload();
});

test('模拟测试不使用相机，参数持久化不包含帧；离开清理全部定时器', () => {
  const h = createRuntime({ platform: 'devtools' }); const page = h.openPage('settings');
  page.startOpticalSimulation(); h.advance(12000);
  assert.equal(page.data.optical.testCount, 3); assert.equal(h.calls.camera, 0); assert.equal(h.timers.size, 0);
  page.onSettingChanging(slider('minDarkMs', 350)); page.onUnload();
  const saved = h.storage.get(PREFERENCES_KEY);
  assert.equal(saved.optical.minDarkMs, 350);
  assert.deepEqual(Object.keys(saved).sort(), ['optical', 'recentExerciseIds', 'schemaVersion', 'sortMode', 'usageMs']);
});

test('平板支撑与无效项目禁止相机，初始化超时可恢复', () => {
  const h = createRuntime(); const plank = h.openPage('training', { exerciseId: 'plank' });
  plank.startOptical(); plank.startCounting();
  assert.equal(h.calls.privacy, 0); assert.equal(plank.data.phase, 'running'); plank.onUnload();
  const pending = createRuntime(); const page = pending.openPage('settings');
  page.startOptical(); pending.advance(13000);
  assert.equal(page.data.optical.mounted, false); assert.equal(page.data.optical.state, 'FAULT');
  page.onUnload(); assert.equal(pending.timers.size, 0);
});
