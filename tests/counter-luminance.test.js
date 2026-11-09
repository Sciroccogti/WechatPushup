const test = require('node:test');
const assert = require('node:assert/strict');
const { Counter } = require('../experiments/optical-demo/core/counter');
const { getLuminance } = require('../experiments/optical-demo/core/luminance');
const { inspectCapabilities, atLeast } = require('../experiments/optical-demo/core/capabilities');

test('触摸防抖、最小间隔、长按与取消、暂停和撤销', () => {
  const c = new Counter({ minIntervalMs: 600 });
  c.start('touch');
  assert.equal(c.touchStart(0), true);
  assert.equal(c.touchStart(1000), false);
  c.touchEnd();
  assert.equal(c.touchStart(100), false);
  c.touchEnd();
  assert.equal(c.touchStart(600), true);
  c.pause();
  assert.equal(c.touchStart(2000), false);
  c.resume(); c.touchEnd();
  assert.equal(c.touchStart(2100), true);
  assert.equal(c.getCount(), 3);
  for (let i = 0; i < 4; i += 1) c.undoCount();
  assert.equal(c.getCount(), 0);
  c.stop();
  assert.equal(c.addCount('manual', 4000), false);
});

test('每次只允许一个自动源，手动调整独立，切换不清空次数', () => {
  const c = new Counter();
  c.start('camera');
  assert.equal(c.addCount('touch', 0), false);
  assert.equal(c.addCount('camera', 0), true);
  assert.equal(c.addCount('manual', 10), true);
  c.start('touch');
  assert.equal(c.addCount('camera', 1000), false);
  assert.equal(c.touchStart(1000), true);
  assert.equal(c.getCount(), 3);
  c.reset();
  assert.equal(c.getCount(), 0);
  assert.equal(c.running, false);
});

test('RGBA 数值、透明通道忽略、坏帧拒绝与抽样上限', () => {
  assert.equal(getLuminance({ width: 1, height: 1, data: Uint8Array.from([255, 255, 255, 0]).buffer }).value, 255);
  assert.equal(getLuminance({ width: 1, height: 1, data: Uint8Array.from([255, 0, 0, 255]).buffer }).value, 255 * 77 / 256);
  const data = new Uint8Array(640 * 480 * 4).fill(80);
  const result = getLuminance({ width: 640, height: 480, data: data.buffer });
  assert.equal(result.value, 80);
  assert.ok(result.samples <= 1024);
  for (const frame of [null, { width: 0, height: 1, data: new ArrayBuffer(0) }, { width: 2, height: 2, data: new ArrayBuffer(4) }]) {
    assert.throws(() => getLuminance(frame), /INVALID_RGBA_FRAME/);
  }
});

test('按数字比较版本；平台、隐私 API 与帧能力分别检查', () => {
  assert.equal(atLeast('2.9.0', '2.32.3'), false);
  assert.equal(atLeast('3.0.0', '2.32.3'), true);
  assert.equal(atLeast('bad', '2.32.3'), false);
  const api = {
    getDeviceInfo: () => ({ platform: 'ios', model: 'test', system: 'iOS' }),
    getAppBaseInfo: () => ({ SDKVersion: '3.0.0' }),
    createCameraContext() {}, authorize() {}, requirePrivacyAuthorize() {}, onNeedPrivacyAuthorization() {}, canIUse: () => true
  };
  assert.equal(inspectCapabilities(api).canCamera, true);
  assert.equal(inspectCapabilities({ ...api, canIUse: () => false }).canCamera, false);
  assert.equal(inspectCapabilities({ ...api, getDeviceInfo: () => ({ platform: 'devtools' }) }).canCamera, false);
  assert.equal(inspectCapabilities({ ...api, getAppBaseInfo: () => ({ SDKVersion: '2.7.0' }) }).canCamera, false);
});
