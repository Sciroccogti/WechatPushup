const test = require('node:test');
const assert = require('node:assert/strict');
const { createRuntime } = require('./helpers/runtime');
const { trainingEvents } = require('./helpers/wxml-events');

test('四项运动由真实WXML绑定的开始按钮一次touchstart→touchend→tap立即启动', () => {
  for (const id of ['push-up', 'sit-up', 'squat', 'plank']) {
    const h = createRuntime(); const page = h.openPage('training', { exerciseId: id });
    const events = trainingEvents(page);
    events.tapButton('startCounting', h);
    assert.equal(page.data.phase, 'running', id);
    assert.equal(page._session.state, 'working');
    assert.equal(page.data.count, 0, '按开始本身不加次数');
    h.advance(1500);
    if (id === 'plank') assert.equal(page.data.count, 1, '不需要额外触屏，计时自行推进');
    else { events.surfaceTouch(); assert.equal(page.data.count, 1, '开始后触屏立即计数'); }
    page.onUnload(); assert.equal(h.timers.size, 0);
  }
});

test('运行中按暂停与继续也保留完整按钮事件，控件触摸不会误加计数', () => {
  for (const id of ['push-up', 'plank']) {
    const h = createRuntime(); const page = h.openPage('training', { exerciseId: id }); const events = trainingEvents(page);
    events.tapButton('startCounting', h); h.advance(1500);
    if (id === 'push-up') events.surfaceTouch();
    events.tapButton('pauseCounting', h);
    assert.equal(page.data.phase, 'paused'); assert.equal(page.data.count, 1);
    assert.equal(h.timers.size, 0);
    h.advance(10000); assert.equal(page.data.count, 1);
    events.tapButton('startCounting', h); assert.equal(page.data.phase, 'running');
    h.advance(1000);
    if (id === 'push-up') events.surfaceTouch();
    assert.equal(page.data.count, 2);
    page.onUnload(); assert.equal(h.timers.size, 0);
  }
});

test('开始按钮选择光学/陀螺仪时先进入校准，设备就绪后启动，期间按钮不误计', () => {
  for (const [id, mode] of [['push-up', 'optical'], ['sit-up', 'gyro'], ['squat', 'gyro']]) {
    const h = createRuntime(); const page = h.openPage('training', { exerciseId: id, mode }); const events = trainingEvents(page);
    events.tapButton('startCounting', h); assert.equal(page.data.phase, 'calibrating'); assert.equal(page.data.count, 0);
    if (mode === 'optical') { page.onCameraReady(); h.hold(160, 3500); }
    else for (let at = 0; at < 1500; at += 20) { h.gyro({ x: 0, y: 0, z: 0 }); h.advance(20); }
    assert.equal(page.data.phase, 'running');
    events.surfaceTouch(); assert.equal(page.data.count, 1);
    page.onUnload(); assert.equal(h.timers.size, 0);
  }
});

test('未开始与暂停期间不轮询刷视图，工作时只提交变化字段', () => {
  const h = createRuntime(); const page = h.openPage('training', { exerciseId: 'push-up' }); const events = trainingEvents(page);
  assert.equal(h.timers.size, 0);
  h.renderPatches.length = 0; h.advance(3000); assert.equal(h.renderPatches.length, 0);
  events.tapButton('startCounting', h);
  h.renderPatches.length = 0; h.advance(750); assert.equal(h.renderPatches.length, 0);
  h.advance(250); assert.equal(h.renderPatches.length, 1); assert.deepEqual(Object.keys(h.renderPatches[0]), ['elapsed']);
  events.tapButton('pauseCounting', h); assert.equal(h.timers.size, 0);
  h.renderPatches.length = 0; h.advance(3000); assert.equal(h.renderPatches.length, 0);
  page.onUnload(); assert.equal(h.timers.size, 0);
});
