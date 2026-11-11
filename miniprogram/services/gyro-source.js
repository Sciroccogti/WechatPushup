const { GyroFSM } = require('../domain/gyro/fsm');
const ownership = require('./movement-owner');

class GyroSource {
  constructor(api, callbacks) { this.api = api; this.callbacks = callbacks; this.epoch = 0; }
  start(options) {
    this.stop();
    ownership.claim(this); this.rotationWanted = true;
    const required = ['startGyroscope', 'stopGyroscope', 'onGyroscopeChange', 'offGyroscopeChange'];
    if (!required.every((key) => typeof this.api[key] === 'function')) return this.fail('当前环境不支持完整陀螺仪接口，已使用触屏。');
    if (typeof this.api.canIUse === 'function' && !required.every((key) => this.api.canIUse(key))) return this.fail('当前基础库不支持陀螺仪完整生命周期，已使用触屏。');
    try {
      if (typeof this.api.getDeviceInfo === 'function' && !['ios', 'android'].includes(this.api.getDeviceInfo().platform)) return this.fail('陀螺仪计数请用Android/iPhone真机测试，工具内可用触屏。');
    } catch (_) { return this.fail('无法确定传感器设备环境，已使用触屏。'); }
    const token = this.epoch; this.fsm = new GyroFSM(options); this.active = false;
    const valid = () => token === this.epoch && ownership.owns(this);
    this.listener = (raw) => {
      if (!valid() || !this.active) return;
      if (!raw || !['x', 'y', 'z'].every((axis) => Number.isFinite(raw[axis]))) return this.fail('陀螺仪信号格式异常，已使用触屏。');
      this.lastFrameAt = Date.now();
      const result = this.fsm.feed(raw, this.lastFrameAt);
      this.callbacks.signal(result);
      if (!valid()) return;
      if (result.issue) return this.fail(result.issue);
      if (result.counted) this.callbacks.count(this.lastFrameAt);
    };
    try {
      this.api.onGyroscopeChange(this.listener);
      this.timeout = setTimeout(() => { if (valid()) this.fail('陀螺仪启动超时，已使用触屏。'); }, 3000);
      this.api.startGyroscope({ interval: 'game', success: () => {
        if (!valid()) { if (!ownership.needs('gyroscope')) this.api.stopGyroscope({ fail() {} }); return; }
        clearTimeout(this.timeout); this.active = true; this.lastFrameAt = Date.now();
        this.watchdog = setInterval(() => { if (valid() && Date.now() - this.lastFrameAt > 3000) this.fail('未收到陀螺仪信号，已使用触屏。'); }, 250);
      }, fail: () => { if (valid()) this.fail('陀螺仪启动失败，已使用触屏。'); } });
    } catch (_) { if (valid()) this.fail('陀螺仪调用失败，已使用触屏。'); }
  }
  fail(message) { this.stop(); this.callbacks.fault(message); }
  configure(options) {
    if (!this.fsm || !ownership.owns(this)) return;
    const signal = this.fsm.configure(options);
    if (this.active) this.callbacks.signal(signal);
  }
  stop() {
    this.epoch += 1; this.active = false; this.rotationWanted = false; clearTimeout(this.timeout); clearInterval(this.watchdog);
    if (this.listener) { try { this.api.offGyroscopeChange(this.listener); } catch (_) {} this.listener = null; }
    if (ownership.owns(this)) { ownership.release(this); try { this.api.stopGyroscope({ fail() {} }); } catch (_) {} }
  }
}
module.exports = { GyroSource };
