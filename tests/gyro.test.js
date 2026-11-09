const test = require('node:test');
const assert = require('node:assert/strict');
const { GyroFSM } = require('../miniprogram/domain/gyro/fsm');
const { createRuntime } = require('./helpers/runtime');

function runSignal(kind) {
  const fsm = new GyroFSM({ axis: 'x' }); let at = 0; let counts = 0;
  const hold = (x, ms) => { for (let elapsed = 0; elapsed < ms; elapsed += 20) { if (fsm.feed({ x, y: 0, z: 0 }, at).counted) counts += 1; at += 20; } };
  hold(0, 1400);
  if (kind === 'normal') for (let i = 0; i < 3; i += 1) { hold(1, 700); hold(0, 200); hold(-1, 700); hold(0, 800); }
  if (kind === 'jitter') for (let i = 0; i < 100; i += 1) { hold(0.15, 20); hold(-0.15, 20); }
  if (kind === 'oneway') { hold(1, 2000); hold(0, 5000); }
  return { fsm, counts };
}
test('陀螺仪只计稳定完整往返，噪声与单向转动不计', () => {
  assert.equal(runSignal('normal').counts, 3);
  assert.equal(runSignal('jitter').counts, 0);
  const one = runSignal('oneway'); assert.equal(one.counts, 0); assert.equal(one.fsm.state, 'FAULT');
});
test('陀螺仪断流重新校准，静止/校准晃动、异常值不误计', () => {
  const fsm = new GyroFSM(); for (let at = 0; at < 1500; at += 20) fsm.feed({ x: 0, y: 0, z: 0 }, at);
  assert.equal(fsm.state, 'READY'); const next = fsm.feed({ x: 1, y: 0, z: 0 }, 3000); assert.equal(next.state, 'CALIBRATING');
  assert.equal(fsm.feed({ x: NaN, y: 0, z: 0 }, 3020).counted, false);
  const moving = new GyroFSM(); for (let at = 0; at < 1500; at += 20) moving.feed({ x: 2, y: 0, z: 0 }, at);
  assert.equal(moving.state, 'FAULT');
});
test('严格按运动分配硬件，胸前X轴默认，休息/后台停止陀螺仪', () => {
  for (const id of ['sit-up', 'squat']) {
    const h = createRuntime(); const page = h.openPage('training', { exerciseId: id });
    page.startOptical(); assert.equal(h.calls.privacy, 0); assert.equal(h.calls.camera, 0);
    page.startGyro(); assert.equal(h.calls.gyroStart, 1); assert.equal(page.data.phase, 'calibrating');
    for (let at = 0; at < 1500; at += 20) { h.gyro({ x: 0, y: 0, z: 0 }); h.advance(20); }
    assert.equal(page.data.phase, 'running'); assert.equal(page._gyro.fsm.config.axis, 'x');
    for (let cycle = 0; cycle < 3; cycle += 1) for (const [x, ms] of [[1, 700], [0, 200], [-1, 700], [0, 800]]) for (let n = 0; n < ms; n += 20) { h.gyro({ x, y: 0, z: 0 }); h.advance(20); }
    assert.equal(page.data.count, 3); page.onHide(); assert.equal(h.gyroListeners.size, 0); assert.ok(h.calls.gyroStop > 0);
    page.onShow(); assert.equal(page.data.phase, 'paused'); assert.equal(h.calls.gyroStart, 1);
    page.startCounting(); assert.equal(h.calls.gyroStart, 2); page.onUnload(); assert.equal(h.timers.size, 0); assert.equal(h.gyroListeners.size, 0);
  }
  const h = createRuntime(); const pushup = h.openPage('training', { exerciseId: 'push-up' }); pushup.startGyro(); assert.equal(h.calls.gyroStart, 0); pushup.onUnload();
});
test('陀螺仪失败/无信号降级，延迟启动不能在后台复活', () => {
  const failed = createRuntime({ gyroFails: true }); const page = failed.openPage('training', { exerciseId: 'squat' }); page.startGyro();
  assert.equal(page.data.selectedMode, 'touch'); assert.ok(page.data.notice); page.onUnload();
  const silent = createRuntime(); const noSignal = silent.openPage('training', { exerciseId: 'sit-up' }); noSignal.startGyro(); silent.advance(3500);
  assert.equal(noSignal.data.selectedMode, 'touch'); assert.equal(silent.gyroListeners.size, 0); noSignal.onUnload();
  const delayed = createRuntime({ delayGyro: true }); const pending = delayed.openPage('training', { exerciseId: 'squat' }); pending.startGyro(); pending.onHide(); delayed.gyroStarts[0].success();
  assert.equal(pending.data.phase, 'paused'); assert.equal(delayed.gyroListeners.size, 0); pending.onUnload(); assert.equal(delayed.timers.size, 0);
});
