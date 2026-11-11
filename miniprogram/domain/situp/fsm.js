const { DEFAULT_SITUP, isValidSitup, pickSitup } = require('../../config/situp');
const axes = ['x', 'y', 'z'];
const validVector = (v) => v && axes.every((key) => Number.isFinite(v[key]));
const norm = (v) => Math.hypot(v.x, v.y, v.z);
// 加速度确定完整离开/返回周期；陀螺仪只提供往返旋转佐证，没有独立计数路径。
class SitupFSM {
  constructor(options) {
    this.config = { ...DEFAULT_SITUP, ...options };
    if (!isValidSitup(this.config)) throw new Error('INVALID_SITUP_SETTINGS');
    this.config = pickSitup(this.config); this.rotationAvailable = false; this.reset();
  }
  reset() {
    this.state = 'CALIBRATING'; this.samples = []; this.lastAt = null; this.lastRotationAt = null;
    this.baseline = null; this.filtered = null; this.tilt = 0; this.magnitudeRatio = 1;
    this.lastCountAt = -Infinity; this.issue = ''; this.clearCycle();
  }
  clearCycle() {
    this.cycleAt = null; this.apexAt = null; this.returnAt = null; this.quietAt = null;
    this.rotationDirection = 0; this.rotationAxis = null; this.rotationOut = 0; this.rotationBack = 0;
  }
  configure(options) {
    const config = { ...this.config, ...options };
    if (!isValidSitup(config)) throw new Error('INVALID_SITUP_SETTINGS');
    this.config = pickSitup(config); this.clearCycle();
    if (this.state === 'FAULT') this.reset();
    else if (this.state !== 'CALIBRATING') this.state = 'SETTLE';
    return this.snapshot(false);
  }
  setRotationAvailable(available) {
    if (this.rotationAvailable === !!available) return;
    this.rotationAvailable = !!available; this.lastRotationAt = null; this.clearCycle();
    if (!['CALIBRATING', 'FAULT'].includes(this.state)) this.state = 'SETTLE';
  }
  feedRotation(raw, at) {
    if (!validVector(raw) || !Number.isFinite(at) || (this.lastRotationAt !== null && at <= this.lastRotationAt)) return;
    const dt = this.lastRotationAt === null || at - this.lastRotationAt > 250 ? 0 : (at - this.lastRotationAt) / 1000;
    this.lastRotationAt = at;
    if (!this.rotationAvailable || !['OUT', 'BACK'].includes(this.state) || this.lastAt === null || at - this.lastAt > 250) return;
    if (!this.rotationDirection) {
      const axis = this.config.rotationAxis === 'auto' ? axes.reduce((best, key) => Math.abs(raw[key]) > Math.abs(raw[best]) ? key : best, 'x') : this.config.rotationAxis;
      if (Math.abs(raw[axis]) < 0.15) return;
      this.rotationAxis = axis; this.rotationDirection = Math.sign(raw[axis]);
    }
    const directed = raw[this.rotationAxis] * this.rotationDirection * dt;
    if (directed > 0) this.rotationOut += directed;
    else this.rotationBack -= directed;
  }
  feedAcceleration(raw, at) {
    if (!validVector(raw) || !Number.isFinite(at) || (this.lastAt !== null && at <= this.lastAt)) return this.snapshot(false);
    if (this.lastAt !== null && at - this.lastAt > 300) this.reset();
    this.lastAt = at;
    if (this.state === 'FAULT') return this.snapshot(false);
    const magnitude = norm(raw);
    if (magnitude < 0.1 || magnitude > 30) { this.clearCycle(); if (this.baseline) this.state = 'SETTLE'; return this.snapshot(false); }
    if (this.state === 'CALIBRATING') {
      this.samples.push({ ...raw, at });
      if (this.samples.length < 20 || at - this.samples[0].at < 1200) return this.snapshot(false);
      const average = {};
      for (const key of axes) average[key] = this.samples.reduce((sum, v) => sum + v[key], 0) / this.samples.length;
      const baselineMagnitude = norm(average);
      const noise = Math.sqrt(this.samples.reduce((sum, v) => sum + axes.reduce((s, key) => s + (v[key] - average[key]) ** 2, 0), 0) / this.samples.length);
      if (baselineMagnitude < 0.1 || noise / baselineMagnitude > 0.06) { this.state = 'FAULT'; this.issue = '校准时请保持起始姿态和手机静止。'; return this.snapshot(false); }
      this.baseline = average; this.baselineMagnitude = baselineMagnitude; this.filtered = { ...average };
      this.samples = []; this.state = 'READY'; return this.snapshot(false);
    }
    this.magnitudeRatio = magnitude / this.baselineMagnitude;
    if (Math.abs(this.magnitudeRatio - 1) > this.config.maxMagnitudeDelta) {
      this.clearCycle(); this.filtered = { ...this.baseline }; this.state = 'SETTLE'; return this.snapshot(false);
    }
    for (const key of axes) this.filtered[key] += this.config.alpha * (raw[key] - this.filtered[key]);
    const denominator = norm(this.filtered) * this.baselineMagnitude;
    if (denominator < 0.01) { this.clearCycle(); this.state = 'SETTLE'; return this.snapshot(false); }
    const cosine = axes.reduce((sum, key) => sum + this.filtered[key] * this.baseline[key], 0) / denominator;
    this.tilt = Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
    if (this.state === 'COUNT') { this.state = 'SETTLE'; this.quietAt = null; }
    if (this.state === 'SETTLE') {
      if (this.tilt <= this.config.returnAngle) {
        if (this.quietAt === null) this.quietAt = at;
        if (at - this.quietAt >= this.config.stableMs) { this.clearCycle(); this.state = 'READY'; }
      } else this.quietAt = null;
      return this.snapshot(false);
    }
    if (this.state === 'READY' && this.tilt > this.config.returnAngle + 5) { this.clearCycle(); this.cycleAt = at; this.state = 'OUT'; }
    if (['OUT', 'BACK'].includes(this.state)) {
      if (at - this.cycleAt > this.config.maxCycleMs) { this.clearCycle(); this.state = 'SETTLE'; return this.snapshot(false); }
      if (this.state === 'OUT') {
        if (this.tilt >= this.config.outAngle) {
          if (this.apexAt === null) this.apexAt = at;
          if (at - this.apexAt >= this.config.stableMs) this.state = 'BACK';
        } else this.apexAt = null;
        if (this.tilt <= this.config.returnAngle) { this.clearCycle(); this.state = 'READY'; }
      } else if (this.tilt <= this.config.returnAngle) {
        if (this.returnAt === null) this.returnAt = at;
        if (at - this.returnAt >= this.config.stableMs) {
          const rotationOK = !this.rotationAvailable || (this.lastRotationAt !== null && at - this.lastRotationAt <= 250 && this.rotationOut >= this.config.minRotation && this.rotationBack >= this.config.minRotation);
          const counted = rotationOK && at - this.cycleAt >= this.config.minCycleMs && at - this.lastCountAt >= this.config.cooldownMs;
          if (counted) this.lastCountAt = at;
          this.state = counted ? 'COUNT' : 'SETTLE'; this.quietAt = null;
          return this.snapshot(counted);
        }
      } else this.returnAt = null;
    }
    return this.snapshot(false);
  }
  snapshot(counted) { return { state: this.state, counted, issue: this.issue, tilt: this.tilt, magnitudeRatio: this.magnitudeRatio, acceleration: { ...(this.filtered || { x: 0, y: 0, z: 0 }) }, rotationAvailable: this.rotationAvailable, rotationOut: this.rotationOut, rotationBack: this.rotationBack }; }
}
module.exports = { SitupFSM };
