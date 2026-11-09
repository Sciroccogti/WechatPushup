const test = require('node:test');
const assert = require('node:assert/strict');
const { OpticalFSM } = require('../experiments/optical-demo/core/optical-fsm');
const { buildSignal } = require('../experiments/optical-demo/core/signals');
const { thresholds } = require('../experiments/optical-demo/core/config');

function harness(options) {
  const fsm = new OpticalFSM(options);
  let now = 0;
  let counts = 0;
  let last;
  return {
    fsm,
    hold(value, duration) {
      for (let i = 0; i < duration; i += 100) {
        last = fsm.feed(typeof value === 'function' ? value(i) : value, now);
        if (last.counted) counts += 1;
        now += 100;
      }
      return last;
    },
    get counts() { return counts; }, get now() { return now; }
  };
}

test('默认模拟：完整周期3次，抖动/持续遮挡/过暗/不稳定0次', () => {
  for (const [kind, expected] of [['normal', 3], ['jitter', 0], ['held', 0], ['dark', 0], ['unstable', 0]]) {
    const fsm = new OpticalFSM();
    const outputs = buildSignal(kind).map((s) => fsm.feed(s.value, s.at));
    assert.equal(outputs.filter((s) => s.counted).length, expected, kind);
    if (kind === 'held') assert.equal(outputs.at(-1).issue, 'OCCLUSION_TIMEOUT');
    if (kind === 'dark') assert.equal(outputs.at(-1).issue, 'TOO_DARK');
    if (kind === 'unstable') assert.equal(outputs.at(-1).issue, 'UNSTABLE');
  }
});

test('先预热再校准；校准不计数，READY→DARK→LIGHT→COUNT→READY', () => {
  const h = harness({ alpha: 1 });
  h.hold(160, 1000);
  assert.equal(h.fsm.samples.length, 0);
  h.hold(160, 2500);
  assert.equal(h.fsm.baseline, 160);
  assert.equal(h.fsm.state, 'READY');
  h.hold(30, 400);
  assert.equal(h.fsm.state, 'DARK');
  assert.equal(h.counts, 0);
  h.hold(160, 100);
  assert.equal(h.fsm.state, 'LIGHT');
  h.hold(160, 300);
  assert.equal(h.fsm.state, 'COUNT');
  assert.equal(h.counts, 1);
  h.hold(160, 3000);
  assert.equal(h.fsm.state, 'READY');
  assert.equal(h.counts, 1);
});

test('短遮挡与短恢复均不能组成稳定周期', () => {
  const h = harness({ alpha: 1 });
  h.hold(160, 3500);
  for (let i = 0; i < 15; i += 1) { h.hold(20, 200); h.hold(160, 400); }
  assert.equal(h.counts, 0);
  h.hold(20, 500);
  for (let i = 0; i < 5; i += 1) { h.hold(160, 200); h.hold(100, 200); }
  assert.equal(h.counts, 0);
  h.hold(160, 500);
  assert.equal(h.counts, 1);
});

test('迟滞区间不能作为恢复；连续遮挡不重复计数', () => {
  const h = harness({ alpha: 1 });
  h.hold(160, 3500);
  h.hold(20, 1000);
  h.hold(115, 1000);
  assert.equal(h.counts, 0);
  assert.equal(h.fsm.state, 'DARK');
  h.hold(160, 600);
  assert.equal(h.counts, 1);
});

test('相对阈值在不同基准与灵敏度下识别完整周期', () => {
  for (const scale of [0.4, 1, 1.4]) {
    for (const sensitivity of [1, 50, 100]) {
      const fsm = new OpticalFSM(thresholds(sensitivity));
      let count = 0;
      buildSignal('normal').forEach((s) => { if (fsm.feed(s.value * scale, s.at).counted) count += 1; });
      assert.equal(count, 3);
    }
  }
});

test('冷却内完成的周期被丢弃，不在持续明亮时延迟补计', () => {
  const h = harness({ alpha: 1, cooldownMs: 3000 });
  h.hold(160, 3500);
  h.hold(20, 400); h.hold(160, 400);
  assert.equal(h.counts, 1);
  h.hold(20, 400); h.hold(160, 400);
  h.hold(160, 4000);
  assert.equal(h.counts, 1);
  h.hold(20, 400); h.hold(160, 400);
  assert.equal(h.counts, 2);
});

test('断帧重新校准，不把间隔当作遮挡或恢复时长', () => {
  const h = harness({ alpha: 1 });
  h.hold(160, 3500); h.hold(20, 500);
  const result = h.fsm.feed(160, h.now + 5000);
  assert.equal(result.state, 'CALIBRATING');
  assert.equal(result.counted, false);
  assert.equal(h.fsm.darkAt, null);
});

test('非法值和倒序/相同时间不改变状态；reset 清除半周期', () => {
  const h = harness({ alpha: 1 });
  h.hold(160, 3500); h.hold(20, 400);
  const state = h.fsm.state;
  for (const value of [NaN, -1, 256, Infinity]) assert.equal(h.fsm.feed(value, h.now).counted, false);
  h.fsm.feed(160, h.now - 200);
  assert.equal(h.fsm.state, state);
  h.fsm.reset();
  assert.equal(h.fsm.state, 'CALIBRATING');
  assert.equal(h.fsm.darkAt, null);
  assert.equal(h.fsm.baseline, null);
});

test('明亮环境漂移报错；FAULT 必须显式重新校准', () => {
  const h = harness({ alpha: 1 });
  h.hold(80, 3500); h.hold(160, 2500);
  assert.equal(h.fsm.issue, 'ENVIRONMENT_CHANGED');
  assert.equal(h.hold(80, 1000).state, 'FAULT');
  h.fsm.reset(); h.hold(80, 3500);
  assert.equal(h.fsm.state, 'READY');
});

test('长期轻微噪声不误计；参数非法时拒绝运行', () => {
  const h = harness();
  h.hold(160, 3500);
  h.hold((i) => 160 + Math.sin(i * 0.017) * 5, 120000);
  assert.equal(h.counts, 0);
  for (const options of [{ alpha: 0 }, { darkRatio: 0.9, lightRatio: 0.8 }, { minDarkMs: -1 }, { maxGapMs: 0 }]) {
    assert.throws(() => new OpticalFSM(options), /INVALID_OPTICAL_CONFIG/);
  }
});
