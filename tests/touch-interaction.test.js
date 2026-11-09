const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CounterManager } = require('../miniprogram/domain/counter/manager');
const { PALETTE, nextTouchFeedback } = require('../miniprogram/utils/touch-feedback');
const { createRuntime } = require('./helpers/runtime');
const { PREFERENCES_KEY } = require('../miniprogram/services/preferences');
const { TrainingStore } = require('../miniprogram/services/training-store');
const down = (x = 80, y = 240) => ({ touches: [{ clientX: x, clientY: y }] });
const up = { touches: [] };

test('触屏可与任一主要传感器同时计数，跨来源600ms合并且保留长按/多点约束', () => {
  for (const sensor of ['optical', 'gyro']) {
    const counter = new CounterManager({ minIntervalMs: 0 }); counter.start(sensor);
    assert.equal(counter.addCount(sensor, 0), true);
    assert.equal(counter.touchStart(100, 1), false); counter.touchEnd(0);
    assert.equal(counter.touchStart(600, 1), true);
    assert.equal(counter.touchStart(2000, 1), false); // 按住仍不连加。
    assert.equal(counter.addCount(sensor, 1000), false);
    assert.equal(counter.addCount(sensor, 1200), true);
    counter.touchEnd(0);
    assert.equal(counter.touchStart(2000, 2), false); counter.touchEnd(1);
    assert.equal(counter.touchStart(2100, 1), false); counter.touchEnd(0);
    assert.equal(counter.touchStart(2200, 1), true);
    assert.equal(counter.source, sensor); assert.equal(counter.getCount(), 4);
    assert.equal(counter.addCount(sensor === 'gyro' ? 'optical' : 'gyro', 3000), false);
  }
});

test('光学遮挡中的触屏计数不会停止相机，超过600ms后该周期的恢复事件仍不重复加数', () => {
  const h = createRuntime(); const page = h.openPage('training', { exerciseId: 'push-up' });
  page.startOptical(); page.onCameraReady(); h.hold(160, 3500); h.hold(30, 800);
  assert.equal(page._fsm.state, 'DARK');
  page.onTouchStart(down()); page.onTouchEnd(up);
  assert.equal(page.data.count, 1); assert.equal(page.data.selectedMode, 'optical'); assert.equal(page.data.optical.mounted, true);
  h.hold(30, 1200); h.hold(160, 1500);
  assert.equal(page.data.count, 1); assert.equal(page.data.optical.testCount, 1); assert.equal(h.calls.stop, 0);
  h.hold(30, 900); h.hold(160, 1500);
  assert.equal(page.data.count, 2); assert.ok(page._session.modes.includes('touch')); assert.ok(page._session.modes.includes('optical'));
  page.onUnload(); assert.equal(h.timers.size, 0);
});

test('仰卧起坐/深蹲的陀螺仪周期中可触屏补数，回程不会重复计数', () => {
  for (const id of ['sit-up', 'squat']) {
    const h = createRuntime(); const page = h.openPage('training', { exerciseId: id });
    page.startGyro();
    const hold = (x, milliseconds) => { for (let at = 0; at < milliseconds; at += 20) { h.gyro({ x, y: 0, z: 0 }); h.advance(20); } };
    hold(0, 1400); hold(1, 700); assert.equal(page._gyro.fsm.state, 'OUT');
    page.onTouchStart(down()); page.onTouchEnd(up); assert.equal(page.data.count, 1);
    hold(0, 200); hold(-1, 700); hold(0, 800);
    assert.equal(page.data.count, 1); assert.equal(page.data.selectedMode, 'gyro'); assert.equal(h.gyroListeners.size, 1);
    hold(1, 700); hold(0, 200); hold(-1, 700); hold(0, 800);
    assert.equal(page.data.count, 2); assert.equal(h.calls.camera, 0);
    page.onUnload(); assert.equal(h.timers.size, 0);
  }
});

test('三项触屏使用实际落点涟漪，整页背景换同色系色彩，长按与被忽略触摸不产生成功反馈', () => {
  for (const id of ['push-up', 'sit-up', 'squat']) {
    const h = createRuntime(); const page = h.openPage('training', { exerciseId: id });
    page.startCounting(); page.onTouchStart(down(36, 88));
    const first = page.data.touchRipples[0];
    assert.equal(first.x, '36px'); assert.equal(first.y, '88px'); assert.ok(PALETTE.includes(first.color));
    assert.equal(page.data.count, 1); h.advance(520); assert.equal(page.data.feedbackColor, first.color);
    h.advance(500); page.onTouchStart(down(150, 360)); assert.equal(page.data.count, 1); assert.equal(page.data.touchRipples.length, 0);
    page.onTouchEnd(up); page.onTouchStart(down(150, 360));
    assert.equal(page.data.count, 2); assert.notEqual(page.data.touchRipples[0].color, first.color);
    const before = page.data.count; page.ignoreControlTouch(down()); assert.equal(page.data.count, before);
    page.pauseCounting(); assert.equal(page.data.touchRipples.length, 0);
    page.onTouchEnd(up); page.onTouchStart(down()); assert.equal(page.data.count, before); assert.equal(page.data.touchRipples.length, 0);
    page.onUnload(); assert.equal(h.timers.size, 0);
  }
});

test('手指从大触区移动到控件再松开，不会锁住下一次触屏', () => {
  const h = createRuntime(); const page = h.openPage('training', { exerciseId: 'push-up' });
  page.startCounting(); page.onTouchStart(down());
  page.ignoreControlTouch({ type: 'touchend', touches: [] }); h.advance(800);
  page.onTouchStart(down()); assert.equal(page.data.count, 2); page.onTouchCancel();
  page.onUnload(); assert.equal(h.timers.size, 0);
});

test('平板大区域可开始/继续计时，触屏反馈不清零/暂停时间，后台释放动画定时器', () => {
  const h = createRuntime(); const page = h.openPage('training', { exerciseId: 'plank' });
  page.onTouchStart(down(100, 180)); assert.equal(page.data.phase, 'running'); assert.equal(page.data.touchRipples[0].x, '100px');
  page.onTouchEnd(up); h.advance(1500);
  page.onTouchStart(down(200, 300)); assert.equal(page.data.count, 1); assert.equal(page.data.phase, 'running');
  page.onTouchEnd(up); h.advance(1000); assert.equal(page.data.count, 2);
  page.pauseCounting(); h.advance(10000); assert.equal(page.data.count, 2);
  page.ignoreControlTouch(down(40, 400)); page.startCounting({ detail: { x: 40, y: 900 } });
  assert.equal(page.data.touchRipples[0].y, '400px'); // 滚动后的控件tap坐标不用于视口涟漪。
  h.advance(1000); assert.equal(page.data.count, 3);
  page.onHide(); assert.equal(h.timers.size, 0);
  page.onShow(); assert.equal(page.data.touchRipples.length, 0); assert.equal(page.data.phase, 'paused');
  page.onUnload(); assert.equal(h.timers.size, 0); assert.equal(h.calls.camera, 0); assert.equal(h.calls.gyroStart, 0);
});

test('执行页排序保留所选项目；工作时禁止换项，暂停后直接换项保存旧结果', () => {
  const h = createRuntime(); const page = h.openPage('training', { exerciseId: 'push-up' });
  const prefs = h.storage.get(PREFERENCES_KEY); prefs.usageMs.squat = 60000; h.storage.set(PREFERENCES_KEY, prefs);
  page.onSortChange({ detail: { value: 0 } }); assert.equal(page.data.exercises[0].id, 'squat'); assert.equal(page.data.exerciseNames[page.data.exerciseIndex], '俯卧撑');
  page.startCounting(); page.manualAdd(); h.advance(1000);
  page.onExerciseChange({ detail: { value: 0 } }); assert.equal(h.redirects.length, 0); assert.equal(page.data.exercise.id, 'push-up');
  page.pauseCounting(); const oldSession = page._session.id;
  page.onExerciseChange({ detail: { value: 0 } });
  const next = h.followRedirect(page); assert.equal(next.data.exercise.id, 'squat'); assert.equal(next.data.purpose, 'free');
  const result = new TrainingStore(h.wx).result(oldSession); assert.equal(result.actual, 1); assert.equal(result.aborted, true);
  next.onUnload(); assert.equal(h.timers.size, 0);
});

test('空项目入口可以就地选择；反馈颜色不重复且无坐标时使用视口中心', () => {
  const h = createRuntime(); const page = h.openPage('training');
  assert.equal(page.data.exercise, null); assert.equal(page.data.exerciseNames.length, 4);
  page.onExerciseChange({ detail: { value: 3 } }); const next = h.followRedirect(page); assert.equal(next.data.exercise.id, 'plank'); next.onUnload();
  const first = nextTouchFeedback(null, null, () => 0); const second = nextTouchFeedback(null, first.color, () => 0);
  assert.notEqual(first.color, second.color); assert.equal(first.x, '50vw'); assert.equal(first.y, '50vh');
  assert.ok(PALETTE.includes(nextTouchFeedback(down(), null, () => NaN).color));
});

test('训练大区域绑定根触摸事件，所有控件与相机/隐私模板均阻止冒泡误计', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/training/index.wxml'), 'utf8');
  assert.ok(markup.includes('bindtouchstart="onTouchStart"'));
  const stack = []; let controls = 0;
  for (const [, closing, tag, attributes] of markup.matchAll(/<(\/?)([\w-]+)\b([^>]*?)>/g)) {
    if (closing) { assert.equal(stack.pop().tag, tag); continue; }
    const protectedTags = ['button', 'picker', 'navigator', 'input'];
    if (protectedTags.includes(tag) || (tag === 'template' && /is="optical-(panel|privacy)"/.test(attributes))) {
      controls += 1;
      assert.ok(stack.some((node) => node.attributes.includes('catchtouchstart="ignoreControlTouch"') && node.attributes.includes('catchtouchend="ignoreControlTouch"')), tag + ' must not bubble to counter');
    }
    if (!attributes.trimEnd().endsWith('/')) stack.push({ tag, attributes });
  }
  assert.equal(stack.length, 0); assert.ok(controls > 10);
  const styles = fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/training/index.wxss'), 'utf8');
  assert.ok(styles.includes('min-height: 60vh')); assert.ok(styles.includes('pointer-events: none')); assert.ok(styles.includes('300vmax'));
});
