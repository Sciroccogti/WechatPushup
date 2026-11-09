// 官方字段为角速度，但文档字段表未注明单位；幅度仅作原始信号积分阈值。
class GyroFSM {
  constructor(options) { this.config = Object.assign({ axis: 'auto', minRate: 0.4, minAngle: 0.25, stableMs: 120, cooldownMs: 900, maxCycleMs: 6000 }, options); this.reset(); }
  reset() {
    this.state = 'CALIBRATING'; this.samples = []; this.lastAt = null; this.filtered = { x: 0, y: 0, z: 0 };
    this.bias = { x: 0, y: 0, z: 0 }; this.candidate = null; this.lastCountAt = -Infinity; this.angle = 0; this.issue = '';
  }
  feed(raw, at) {
    if (!raw || !['x', 'y', 'z'].every((axis) => Number.isFinite(raw[axis])) || !Number.isFinite(at) || (this.lastAt !== null && at <= this.lastAt)) return this.snapshot(false);
    if (this.lastAt !== null && at - this.lastAt > 300) this.reset();
    const dt = this.lastAt === null ? 0 : (at - this.lastAt) / 1000; this.lastAt = at;
    if (this.state === 'FAULT') return this.snapshot(false);
    if (this.state === 'CALIBRATING') {
      this.samples.push({ ...raw, at });
      if (this.samples.length < 20 || at - this.samples[0].at < 1200) return this.snapshot(false);
      for (const axis of ['x', 'y', 'z']) {
        this.bias[axis] = this.samples.reduce((sum, sample) => sum + sample[axis], 0) / this.samples.length;
        const variance = this.samples.reduce((sum, sample) => sum + Math.pow(sample[axis] - this.bias[axis], 2), 0) / this.samples.length;
        if (Math.sqrt(variance) > 0.2 || Math.abs(this.bias[axis]) > 0.3) { this.state = 'FAULT'; this.issue = '校准期间请保持手机静止。'; return this.snapshot(false); }
      }
      this.state = 'READY'; return this.snapshot(false);
    }
    for (const axis of ['x', 'y', 'z']) this.filtered[axis] += 0.35 * (raw[axis] - this.bias[axis] - this.filtered[axis]);
    if (this.state === 'COUNT') { this.state = 'SETTLE'; this.quietAt = null; }
    if (this.state === 'SETTLE') {
      if (['x', 'y', 'z'].every((axis) => Math.abs(this.filtered[axis]) < this.config.minRate * 0.4)) {
        if (this.quietAt === null) this.quietAt = at;
        if (at - this.quietAt >= this.config.stableMs) this.state = 'READY';
      } else this.quietAt = null;
      return this.snapshot(false);
    }
    if (this.state === 'READY') {
      const axis = this.config.axis === 'auto' ? ['x', 'y', 'z'].reduce((best, key) => Math.abs(this.filtered[key]) > Math.abs(this.filtered[best]) ? key : best, 'x') : this.config.axis;
      const rate = this.filtered[axis];
      if (Math.abs(rate) < this.config.minRate) this.candidate = null;
      else {
        const direction = Math.sign(rate);
        if (!this.candidate || this.candidate.axis !== axis || this.candidate.direction !== direction) this.candidate = { axis, direction, at, angle: 0 };
        this.candidate.angle += rate * dt;
        if (at - this.candidate.at >= this.config.stableMs) {
          this.axis = axis; this.direction = direction; this.angle = this.candidate.angle;
          this.peak = Math.abs(this.angle); this.cycleAt = this.candidate.at; this.state = 'OUT'; this.returnAt = null; this.reverseAt = null;
        }
      }
    } else {
      this.angle += this.filtered[this.axis] * dt;
      this.peak = Math.max(this.peak, this.direction * this.angle);
      if (at - this.cycleAt > this.config.maxCycleMs) { this.state = 'FAULT'; this.issue = '未形成稳定往返周期，请重新固定手机并校准。'; return this.snapshot(false); }
      if (this.state === 'OUT') {
        if (this.direction * this.filtered[this.axis] < -this.config.minRate && this.peak >= this.config.minAngle) {
          if (this.reverseAt === null) this.reverseAt = at;
          if (at - this.reverseAt >= this.config.stableMs) this.state = 'BACK';
        } else this.reverseAt = null;
      }
      if (this.state === 'BACK') {
        const returned = this.direction * this.angle <= Math.max(0.08, this.peak * 0.2);
        if (returned) {
          if (this.returnAt === null) this.returnAt = at;
          if (at - this.returnAt >= this.config.stableMs && at - this.cycleAt >= 500) {
            const counted = at - this.lastCountAt >= this.config.cooldownMs;
            if (counted) this.lastCountAt = at;
            this.state = counted ? 'COUNT' : 'READY'; this.candidate = null;
            return this.snapshot(counted);
          }
        } else this.returnAt = null;
      }
    }
    return this.snapshot(false);
  }
  snapshot(counted) { return { state: this.state, counted, issue: this.issue, rates: { ...this.filtered }, angle: this.angle, axis: this.axis || 'auto' }; }
}
module.exports = { GyroFSM };
