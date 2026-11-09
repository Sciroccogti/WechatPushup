const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const { buildSignal } = require('../experiments/optical-demo/core/signals');

function setup(options = {}) {
  const filename = path.resolve(__dirname, '../experiments/optical-demo/pages/index/index.js');
  let definition;
  let now = 100000;
  let nextId = 0;
  let frame;
  let auth;
  let start;
  const viewCallbacks = [];
  const timers = new Map();
  const calls = { stop: 0, create: 0, privacy: 0, authorize: 0 };
  const schedule = (fn, delay, repeat) => { const id = ++nextId; timers.set(id, { fn, at: now + delay, delay, repeat }); return id; };
  const api = {
    getDeviceInfo: () => ({ platform: 'ios', model: 'mock', system: 'iOS' }),
    getAppBaseInfo: () => ({ SDKVersion: '3.0.0', version: 'mock' }),
    canIUse: () => true, onNeedPrivacyAuthorization() {},
    requirePrivacyAuthorize(opts) { calls.privacy += 1; options.denyPrivacy ? opts.fail() : opts.success(); },
    authorize(opts) { calls.authorize += 1; auth = opts; if (!options.delayAuth) opts.success(); },
    createCameraContext() {
      calls.create += 1;
      return { onCameraFrame(callback) {
        frame = callback;
        return { start(opts) { start = opts; if (!options.delayStart) opts.success(); }, stop() { calls.stop += 1; } };
      } };
    },
    vibrateShort() {}, showToast() {}, openSetting() {}, setClipboardData() {}
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page: (value) => { definition = value; }, require: createRequire(filename), wx: api,
    Date: { now: () => now },
    setTimeout: (fn, delay) => schedule(fn, delay, false),
    setInterval: (fn, delay) => schedule(fn, delay, true),
    clearTimeout: (id) => timers.delete(id), clearInterval: (id) => timers.delete(id)
  }, { filename });
  const page = { ...definition, data: structuredClone(definition.data), setData(patch, callback) {
    Object.assign(this.data, patch);
    if (callback) { if (options.delayView) viewCallbacks.push(callback); else callback(); }
  } };
  page.onLoad(); page.onShow();
  return {
    page, calls, api, timers, viewCallbacks,
    get frame() { return frame; }, get auth() { return auth; }, get start() { return start; },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, item] = due;
        now = item.at;
        if (item.repeat) item.at += item.delay; else timers.delete(id);
        item.fn();
      }
      now = end;
    },
    emit(value) { frame({ width: 1, height: 1, data: Uint8Array.from([value, value, value, 255]).buffer }); }
  };
}

test('页面加载不采集；仅主动开启、授权和 initdone 后开始监听', () => {
  const h = setup();
  assert.equal(h.calls.privacy, 0);
  assert.equal(h.calls.create, 0);
  h.page.startCamera();
  assert.equal(h.calls.privacy, 1);
  assert.equal(h.calls.authorize, 1);
  assert.equal(h.page.data.cameraMounted, true);
  assert.equal(h.calls.create, 0);
  h.page.onCameraReady();
  assert.equal(h.calls.create, 1);
  assert.equal(h.page.data.active, true);
  h.page.onCameraReady();
  assert.equal(h.calls.create, 1);
  h.page.onUnload();
  assert.equal(h.timers.size, 0);
});

test('真实帧格式的模拟输入经过亮度/状态机/统一计数器新增3次', () => {
  const h = setup(); h.page.startCamera(); h.page.onCameraReady();
  for (const sample of buildSignal('normal')) { h.emit(sample.value); h.advance(100); }
  assert.equal(h.page.data.count, 3);
  assert.equal(h.page.data.baseline, '160.0');
  h.page.onUnload();
});

test('后台释放监听与定时器；旧帧失效；返回保留次数并重新校准', () => {
  const h = setup(); h.page.startCamera(); h.page.onCameraReady(); h.page.manualAdd();
  const oldFrame = h.frame;
  h.page.onHide();
  assert.equal(h.calls.stop, 1);
  assert.equal(h.timers.size, 0);
  assert.equal(h.page.data.cameraMounted, false);
  oldFrame({});
  assert.equal(h.page.data.count, 1);
  h.page.onShow();
  assert.equal(h.page.data.cameraMounted, true);
  assert.equal(h.page.data.state, 'CALIBRATING');
  h.page.onCameraReady();
  assert.equal(h.calls.create, 2);
  h.page.onUnload();
});

test('切换触屏后旧帧不生效；touchcancel/长按不连加', () => {
  const h = setup(); h.page.startCamera(); h.page.onCameraReady();
  const oldFrame = h.frame;
  h.page.startTouch(); oldFrame({});
  assert.equal(h.calls.stop, 1);
  assert.equal(h.page.data.source, 'touch');
  h.page.onTouchStart({ touches: [{}] });
  h.advance(1000); h.page.onTouchStart({ touches: [{}] });
  assert.equal(h.page.data.count, 1);
  h.page.onTouchEnd(); h.page.onTouchStart({ touches: [{}] });
  assert.equal(h.page.data.count, 2);
  h.page.onUnload();
});

test('停止后延迟授权不得挂载 camera；卸载后不得更新页面', () => {
  const h = setup({ delayAuth: true }); h.page.startCamera();
  h.page.stop(); h.auth.success();
  assert.equal(h.page.data.cameraMounted, false);
  h.page.onUnload();
  h.page.setData = () => assert.fail('卸载后的页面不应 setData');
  h.auth.success(); h.auth.fail(); h.advance(20000);
  assert.equal(h.timers.size, 0);
});

test('监听 start 延迟成功时再次 stop，避免后台复活', () => {
  const h = setup({ delayStart: true }); h.page.startCamera(); h.page.onCameraReady();
  h.page.onHide();
  h.start.success();
  assert.equal(h.calls.stop, 2);
  assert.equal(h.page.data.active, false);
  assert.equal(h.timers.size, 0);
});

test('无帧超时、拒绝授权、异常帧都会降级到触屏', () => {
  const silent = setup(); silent.page.startCamera(); silent.page.onCameraReady(); silent.advance(3500);
  assert.equal(silent.page.data.source, 'touch');
  assert.equal(silent.page.data.cameraMounted, false);
  assert.match(silent.page.data.issue, /未收到/);
  const denied = setup({ denyPrivacy: true }); denied.page.startCamera();
  assert.equal(denied.calls.authorize, 0);
  assert.equal(denied.page.data.source, 'touch');
  const malformed = setup(); malformed.page.startCamera(); malformed.page.onCameraReady(); malformed.frame({});
  assert.equal(malformed.page.data.source, 'touch');
  for (const h of [silent, denied, malformed]) { h.page.onUnload(); assert.equal(h.timers.size, 0); }
});

test('初始化超时/实际方法缺失降级；暂停后重新校准', () => {
  const pending = setup({ delayAuth: true }); pending.page.startCamera(); pending.advance(13000);
  assert.equal(pending.page.data.source, 'touch');
  pending.auth.success(); assert.equal(pending.page.data.cameraMounted, false);
  const unsupported = setup(); unsupported.api.createCameraContext = () => ({});
  unsupported.page.startCamera(); unsupported.page.onCameraReady();
  assert.equal(unsupported.page.data.source, 'touch');
  const paused = setup(); paused.page.startCamera(); paused.page.onCameraReady();
  paused.page.togglePause(); assert.equal(paused.page.data.paused, true);
  assert.equal(paused.timers.size, 0);
  paused.page.togglePause(); assert.equal(paused.page.data.state, 'CALIBRATING');
  for (const h of [pending, unsupported, paused]) h.page.onUnload();
});

test('全部模拟场景可运行；停止和卸载清理模拟定时器', () => {
  for (let index = 0; index < 5; index += 1) {
    const h = setup(); h.page.data.scenarioIndex = index;
    h.page.startSimulation(); h.advance(20000);
    assert.equal(h.page.data.count, index === 0 ? 3 : 0);
    h.page.onUnload(); assert.equal(h.timers.size, 0);
  }
});

test('等待视图卸载后才重挂 camera，延迟视图回调不能复活已停止会话', () => {
  const h = setup({ delayView: true });
  h.page.startCamera();
  assert.equal(h.page.data.cameraMounted, false);
  assert.equal(h.viewCallbacks.length, 1);
  h.viewCallbacks.shift()();
  assert.equal(h.page.data.cameraMounted, true);
  h.page.onCameraReady();
  h.page.startCamera();
  assert.equal(h.calls.stop, 1);
  assert.equal(h.page.data.cameraMounted, false);
  h.page.stop();
  h.viewCallbacks.shift()();
  assert.equal(h.page.data.cameraMounted, false);
  h.page.onUnload();
  assert.equal(h.timers.size, 0);
});

test('应用隐私回调转交当前页面；同意和取消仅处理一次待决授权', () => {
  const h = setup();
  let privacyListener;
  let app;
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../experiments/optical-demo/app.js'), 'utf8'), {
    App: (value) => { app = value; },
    wx: { onNeedPrivacyAuthorization(callback) { privacyListener = callback; } },
    getCurrentPages: () => [h.page]
  });
  app.onLaunch();
  const resolutions = [];
  h.page.data.busy = true;
  privacyListener((value) => resolutions.push(value));
  assert.equal(h.page.data.privacyVisible, true);
  h.page.agreePrivacy(); h.page.agreePrivacy();
  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].event, 'agree');
  assert.equal(resolutions[0].buttonId, 'privacy-agree');
  h.page.data.busy = true;
  privacyListener((value) => resolutions.push(value));
  h.page.rejectPrivacy();
  assert.equal(resolutions.at(-1).event, 'disagree');
  assert.equal(h.page.data.source, 'touch');
  h.page.onUnload();
});
