const { SitupFSM } = require('../domain/situp/fsm');
const ownership = require('./movement-owner');
const validVector = (v) => v && ['x', 'y', 'z'].every((key) => Number.isFinite(v[key]));
class SitupSource {
  constructor(api, callbacks) { this.api = api; this.callbacks = callbacks; this.epoch = 0; this.auxEpoch = 0; }
  supported(names) { return names.every((name) => typeof this.api[name] === 'function' && (typeof this.api.canIUse !== 'function' || this.api.canIUse(name))); }
  start(options) {
    this.stop(); ownership.claim(this); this.accelerometerWanted = true;
    if (!this.supported(['startAccelerometer', 'stopAccelerometer', 'onAccelerometerChange', 'offAccelerometerChange'])) return this.fail('加速度接口不可用，已使用触屏。');
    try {
      if (typeof this.api.getDeviceInfo === 'function' && !['ios', 'android'].includes(this.api.getDeviceInfo().platform)) return this.fail('加速度检测请使用Android/iPhone真机，工具内可用触屏。');
    } catch (_) { return this.fail('无法确认设备环境，已使用触屏。'); }
    this.fsm = new SitupFSM(options); this.active = false; this.auxMessage = '';
    const token = this.epoch; const valid = () => token === this.epoch && ownership.owns(this);
    this.accelListener = (raw) => {
      if (!valid() || !this.active) return;
      if (!validVector(raw)) return this.fail('加速度信号异常，已使用触屏。');
      this.lastAccelAt = Date.now(); const signal = this.fsm.feedAcceleration(raw, this.lastAccelAt);
      this.emit(signal);
      if (!valid()) return;
      if (signal.issue) return this.fail(signal.issue);
      if (signal.counted) this.callbacks.count(this.lastAccelAt);
    };
    try {
      this.api.onAccelerometerChange(this.accelListener);
      this.startTimeout = setTimeout(() => { if (valid()) this.fail('加速度启动超时，已使用触屏。'); }, 3000);
      this.api.startAccelerometer({ interval: 'game', success: () => {
        if (!valid()) { if (!ownership.needs('accelerometer')) this.api.stopAccelerometer({ fail() {} }); return; }
        clearTimeout(this.startTimeout); this.active = true; this.lastAccelAt = Date.now();
        this.watchdog = setInterval(() => {
          if (!valid()) return;
          const at = Date.now();
          if (at - this.lastAccelAt > 3000) return this.fail('加速度信号中断，已使用触屏。');
          if (this.rotationActive && at - this.lastRotationAt > 1000) this.disableRotation('旋转信号中断，仅使用加速度；请回起始姿态。');
        }, 250);
      }, fail: () => { if (valid()) this.fail('加速度启动失败，已使用触屏。'); } });
      // 主传感器同步失败时不能继续启动辅助硬件。
      if (valid()) this.startRotation(valid);
    } catch (_) { if (valid()) this.fail('加速度调用失败，已使用触屏。'); }
  }
  emit(signal) { this.callbacks.signal({ ...signal, auxMessage: this.auxMessage }); }
  startRotation(valid) {
    if (!this.supported(['startGyroscope', 'stopGyroscope', 'onGyroscopeChange', 'offGyroscopeChange'])) return this.disableRotation('旋转接口不可用，仅使用加速度检测。');
    this.rotationWanted = true; const auxToken = this.auxEpoch;
    const auxValid = () => valid() && this.rotationWanted && auxToken === this.auxEpoch;
    this.rotationListener = (raw) => {
      if (!auxValid() || !this.rotationActive) return;
      if (!validVector(raw)) return this.disableRotation('旋转信号异常，仅使用加速度；请回起始姿态。');
      this.lastRotationAt = Date.now(); this.fsm.feedRotation(raw, this.lastRotationAt);
    };
    try {
      this.api.onGyroscopeChange(this.rotationListener);
      this.rotationTimeout = setTimeout(() => { if (auxValid()) this.disableRotation('旋转启动超时，仅使用加速度；请回起始姿态。'); }, 2000);
      this.api.startGyroscope({ interval: 'game', success: () => {
        if (!auxValid()) {
          if (!ownership.needs('gyroscope')) { try { this.api.stopGyroscope({ fail() {} }); } catch (_) {} }
          return;
        }
        clearTimeout(this.rotationTimeout); this.rotationActive = true; this.lastRotationAt = Date.now(); this.fsm.setRotationAvailable(true);
        this.emit(this.fsm.snapshot(false));
      }, fail: () => { if (auxValid()) this.disableRotation('旋转启动失败，仅使用加速度检测。'); } });
    } catch (_) { if (auxValid()) this.disableRotation('旋转接口调用失败，仅使用加速度检测。'); }
  }
  disableRotation(message) {
    this.auxEpoch += 1; this.rotationWanted = false; this.rotationActive = false; clearTimeout(this.rotationTimeout);
    if (this.rotationListener) { try { this.api.offGyroscopeChange(this.rotationListener); } catch (_) {} this.rotationListener = null; }
    if (ownership.owns(this) && typeof this.api.stopGyroscope === 'function') { try { this.api.stopGyroscope({ fail() {} }); } catch (_) {} }
    this.auxMessage = message;
    if (this.fsm) { this.fsm.setRotationAvailable(false); this.emit(this.fsm.snapshot(false)); }
  }
  configure(options) { if (this.fsm && ownership.owns(this)) this.emit(this.fsm.configure(options)); }
  fail(message) { this.stop(); this.callbacks.fault(message); }
  stop() {
    this.epoch += 1; this.auxEpoch += 1; this.active = false; this.rotationActive = false; this.rotationWanted = false; this.accelerometerWanted = false;
    clearTimeout(this.startTimeout); clearTimeout(this.rotationTimeout); clearInterval(this.watchdog);
    if (this.accelListener) { try { this.api.offAccelerometerChange(this.accelListener); } catch (_) {} this.accelListener = null; }
    if (this.rotationListener) { try { this.api.offGyroscopeChange(this.rotationListener); } catch (_) {} this.rotationListener = null; }
    if (ownership.owns(this)) {
      ownership.release(this);
      try { this.api.stopAccelerometer({ fail() {} }); } catch (_) {}
      try { this.api.stopGyroscope({ fail() {} }); } catch (_) {}
    }
  }
}
module.exports = { SitupSource };
