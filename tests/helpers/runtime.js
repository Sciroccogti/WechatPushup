const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createRuntime(options = {}) {
  const root = path.resolve(__dirname, '../../miniprogram');
  const storage = options.storage || new Map();
  const modules = new Map();
  const timers = new Map();
  const frames = [];
  const authorizations = [];
  const starts = [];
  const viewCallbacks = [];
  const privacyRequests = [];
  const redirects = [];
  const gyroListeners = new Set();
  const gyroStarts = [];
  const accelListeners = new Set(); const accelStarts = [];
  const calls = { camera: 0, stop: 0, writes: 0, privacy: 0, gyroStart: 0, gyroStop: 0, accelStart: 0, accelStop: 0 };
  const renderPatches = [];
  let now = 100000;
  let timerId = 0;
  let capturedPage;
  let capturedApp;
  let currentPage;
  let privacyListener;
  const schedule = (fn, delay, repeat) => { const id = ++timerId; timers.set(id, { fn, at: now + delay, delay, repeat }); return id; };
  const wx = {
    getStorageSync(key) { if (options.readFails) throw new Error('read'); return storage.has(key) ? structuredClone(storage.get(key)) : ''; },
    setStorageSync(key, value) { calls.writes += 1; if (options.writeFails) throw new Error('full'); storage.set(key, structuredClone(value)); },
    removeStorageSync(key) { if (options.removeFails) throw new Error('remove'); storage.delete(key); },
    getDeviceInfo: () => ({ platform: options.platform || 'ios', model: 'mock', system: 'mock' }),
    getAppBaseInfo: () => ({ SDKVersion: '3.0.0', version: 'mock' }),
    canIUse: (name) => options.unsupported !== true && !(options.unsupportedApis || []).includes(name),
    onNeedPrivacyAuthorization(fn) { privacyListener = fn; },
    requirePrivacyAuthorize(callbacks) {
      calls.privacy += 1;
      privacyRequests.push(callbacks);
      if (options.delayPrivacy) return;
      if (options.denyPrivacy) return callbacks.fail();
      if (options.needsPrivacy) {
        if (!privacyListener) throw new Error('Missing app privacy listener');
        return privacyListener((result) => result.event === 'agree' ? callbacks.success() : callbacks.fail());
      }
      callbacks.success();
    },
    authorize(callbacks) { authorizations.push(callbacks); if (!options.delayAuthorize) callbacks.success(); },
    createCameraContext(...args) {
      if (args.length) throw new Error('createCameraContext has no public arguments');
      calls.camera += 1;
      if (options.noContext) return {};
      return { onCameraFrame(callback) {
        frames.push(callback);
        return {
          start(callbacks) { starts.push(callbacks); if (options.startFails) callbacks.fail(); else if (!options.delayStart) callbacks.success(); },
          stop() { calls.stop += 1; }
        };
      } };
    },
    redirectTo(callbacks) { redirects.push(callbacks.url); if (options.redirectFails && callbacks.fail) callbacks.fail(); },
    onGyroscopeChange(fn) { gyroListeners.add(fn); }, offGyroscopeChange(fn) { gyroListeners.delete(fn); },
    startGyroscope(callbacks) { calls.gyroStart += 1; gyroStarts.push(callbacks); if (options.gyroFails) callbacks.fail(); else if (!options.delayGyro) callbacks.success(); },
    stopGyroscope() { calls.gyroStop += 1; },
    onAccelerometerChange(fn) { accelListeners.add(fn); }, offAccelerometerChange(fn) { accelListeners.delete(fn); },
    startAccelerometer(callbacks) { calls.accelStart += 1; accelStarts.push(callbacks); if (options.accelFails) callbacks.fail(); else if (!options.delayAccel) callbacks.success(); },
    stopAccelerometer() { calls.accelStop += 1; },
    openSetting() {}, openPrivacyContract() {}, showToast() {}, vibrateShort() {}
  };
  const sandbox = {
    wx, Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }, ArrayBuffer, Uint8Array,
    setTimeout: (fn, delay) => schedule(fn, delay, false),
    setInterval: (fn, delay) => schedule(fn, delay, true),
    clearTimeout: (id) => timers.delete(id), clearInterval: (id) => timers.delete(id),
    Page: (value) => { capturedPage = value; }, App: (value) => { capturedApp = value; },
    getCurrentPages: () => currentPage ? [currentPage] : []
  };
  function loadModule(filename, force) {
    if (!force && modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const localRequire = (target) => {
      if (!target.startsWith('.')) throw new Error('Unexpected external app dependency');
      let next = path.resolve(path.dirname(filename), target);
      if (!path.extname(next)) next += '.js';
      return loadModule(next, false);
    };
    vm.runInNewContext('(function(require, module, exports) {\n' + fs.readFileSync(filename, 'utf8') + '\n})', sandbox, { filename })(localRequire, module, module.exports);
    return module.exports;
  }
  function loadPage(name) {
    capturedPage = null;
    loadModule(path.join(root, 'pages', name, 'index.js'), true);
    const page = { ...capturedPage, data: structuredClone(capturedPage.data), setData(patch, callback) {
      renderPatches.push(structuredClone(patch));
      for (const [key, value] of Object.entries(patch)) {
        const keys = key.split('.');
        let target = this.data;
        for (const part of keys.slice(0, -1)) target = target[part];
        target[keys[keys.length - 1]] = value;
      }
      if (callback) { if (options.delayView) viewCallbacks.push(callback); else callback(); }
    } };
    currentPage = page;
    return page;
  }
  return {
    wx, calls, frames, starts, authorizations, privacyRequests, viewCallbacks, timers, storage, redirects, gyroListeners, gyroStarts, accelListeners, accelStarts, renderPatches,
    now() { return now; },
    loadPage,
    openPage(name, params) { const page = loadPage(name); if (page.onLoad) page.onLoad(params); if (page.onShow) page.onShow(); return page; },
    launchApp() { loadModule(path.join(root, 'app.js'), true); capturedApp.onLaunch(); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, item] = due; now = item.at;
        if (item.repeat) item.at += item.delay; else timers.delete(id);
        item.fn();
      }
      now = end;
    },
    gyro(raw) { for (const listener of [...gyroListeners]) listener(raw); },
    accel(raw) { for (const listener of [...accelListeners]) listener(raw); },
    followRedirect(previous) {
      const url = new URL(redirects.at(-1), 'https://local.invalid');
      if (previous.onHide) previous.onHide(); if (previous.onUnload) previous.onUnload();
      return this.openPage(url.pathname.split('/')[2], Object.fromEntries(url.searchParams));
    },
    emit(value) { frames.at(-1)({ width: 1, height: 1, data: Uint8Array.from([value, value, value, 255]).buffer }); },
    hold(value, duration) { for (let at = 0; at < duration; at += 100) { this.emit(value); this.advance(100); } }
  };
}

module.exports = { createRuntime };
