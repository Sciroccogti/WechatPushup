const test = require('node:test');
const assert = require('node:assert/strict');
const { OpticalFSM } = require('../miniprogram/domain/optical/fsm');
const { DEFAULT_OPTICAL } = require('../miniprogram/config/optical');
const { buildSignal } = require('../miniprogram/domain/optical/signals');
const { CounterManager } = require('../miniprogram/domain/counter/manager');

test('正式光学算法保持正常3周期/抖动/长遮挡/过暗/不稳定行为', () => {
  for (const kind of ['normal', 'jitter', 'held', 'dark', 'unstable']) {
    const fsm = new OpticalFSM(DEFAULT_OPTICAL);
    const count = buildSignal(kind).filter((sample) => fsm.feed(sample.value, sample.at).counted).length;
    assert.equal(count, kind === 'normal' ? 3 : 0, kind);
  }
});

test('运行中修改阈值保留校准与相机基准，清除半周期且不凭空计数', () => {
  const fsm = new OpticalFSM({ ...DEFAULT_OPTICAL, alpha: 1 });
  for (let at = 0; at < 3500; at += 100) fsm.feed(160, at);
  for (let at = 3500; at < 4000; at += 100) fsm.feed(20, at);
  assert.equal(fsm.state, 'DARK');
  fsm.configure({ darkRatio: 0.55, lightRatio: 0.85 });
  assert.equal(fsm.baseline, 160); assert.equal(fsm.state, 'READY');
  for (let at = 4000; at < 5000; at += 100) assert.equal(fsm.feed(160, at).counted, false);
  let count = 0;
  for (let at = 5000; at < 5500; at += 100) if (fsm.feed(20, at).counted) count += 1;
  for (let at = 5500; at < 6100; at += 100) if (fsm.feed(160, at).counted) count += 1;
  assert.equal(count, 1);
  assert.throws(() => fsm.configure({ darkRatio: 0.99 }), /INVALID_OPTICAL_CONFIG/);
});

test('故障后数值仍实时更新但不计数，必须重新校准', () => {
  const fsm = new OpticalFSM(DEFAULT_OPTICAL);
  buildSignal('dark').forEach((s) => fsm.feed(s.value, s.at));
  const signal = fsm.feed(160, 4100);
  assert.equal(signal.state, 'FAULT'); assert.equal(signal.raw, 160); assert.equal(signal.counted, false);
  fsm.configure(DEFAULT_OPTICAL); assert.equal(fsm.state, 'FAULT');
  fsm.reset(); assert.equal(fsm.state, 'CALIBRATING');
});

test('统一计数器互斥、防抖、长按、多触点、暂停和撤销', () => {
  const counter = new CounterManager(); counter.start('touch');
  assert.equal(counter.touchStart(0, 1), true);
  assert.equal(counter.touchStart(1000, 1), false);
  counter.touchEnd(0); assert.equal(counter.touchStart(100, 1), false);
  counter.touchEnd(0); assert.equal(counter.touchStart(1000, 2), false);
  counter.touchEnd(1); assert.equal(counter.touchStart(1200, 1), false);
  counter.touchEnd(0); assert.equal(counter.touchStart(1400, 1), true);
  counter.start('optical'); assert.equal(counter.addCount('gyro', 2100), false);
  assert.equal(counter.addCount('optical', 2100), true);
  counter.pause(); assert.equal(counter.addCount('manual', 3000), false);
  counter.resume(); assert.equal(counter.addCount('manual', 3100), true);
  for (let i = 0; i < 6; i += 1) counter.undoCount();
  assert.equal(counter.getCount(), 0);
  counter.stop(); counter.resume(); assert.equal(counter.running, false);
});
