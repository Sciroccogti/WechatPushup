const { DEFAULTS } = require('./config');

class OpticalFSM {
  constructor(options) {
    this.config = Object.assign({}, DEFAULTS, options);
    const c = this.config;
    if (!(c.darkRatio > 0 && c.darkRatio < c.lightRatio && c.lightRatio < 1) ||
        !(c.alpha > 0 && c.alpha <= 1) || !(c.calibrationSamples >= 2) ||
        ['minDarkMs', 'minLightMs', 'cooldownMs', 'calibrationSpanMs', 'warmupMs'].some((k) => !(c[k] >= 0)) ||
        !(c.maxGapMs > 0) || !(c.maxDarkMs > c.minDarkMs) || !(c.minBaseline > 0) ||
        !(c.maxCalibrationCv > 0)) throw new Error('INVALID_OPTICAL_CONFIG');
    this.reset();
  }

  reset() {
    this.state = 'CALIBRATING';
    this.issue = '';
    this.baseline = null;
    this.filtered = null;
    this.lastAt = null;
    this.warmupAt = null;
    this.samples = [];
    this.darkAt = null;
    this.lightAt = null;
    this.driftAt = null;
    this.lastCountAt = -Infinity;
  }

  configure(options) {
    const checked = new OpticalFSM(Object.assign({}, this.config, options));
    this.config = checked.config;
    // 调参保留相机、基准和平滑值，但清除未完成周期，不能跨阈值修改补计。
    this.darkAt = null;
    this.lightAt = null;
    this.driftAt = null;
    if (this.state !== 'FAULT' && this.baseline !== null) this.state = 'READY';
  }

  snapshot(counted, raw) {
    return {
      state: this.state, issue: this.issue, raw,
      filtered: this.filtered, baseline: this.baseline,
      ratio: this.baseline ? this.filtered / this.baseline : null,
      calibrationProgress: Math.min(100, Math.round(this.samples.length / this.config.calibrationSamples * 100)),
      counted: !!counted
    };
  }

  fault(issue, raw) {
    this.state = 'FAULT';
    this.issue = issue;
    return this.snapshot(false, raw);
  }

  feed(raw, at) {
    if (!Number.isFinite(raw) || raw < 0 || raw > 255 || !Number.isFinite(at) ||
        (this.lastAt !== null && at <= this.lastAt)) return this.snapshot(false, raw);
    if (this.state === 'FAULT') {
      this.lastAt = at;
      this.filtered = this.filtered === null ? raw : this.filtered + this.config.alpha * (raw - this.filtered);
      return this.snapshot(false, raw);
    }
    // 断流不能将间隔时间当作连续遮挡/恢复。重新校准但保留冷却历史。
    if (this.lastAt !== null && at - this.lastAt > this.config.maxGapMs) {
      const lastCountAt = this.lastCountAt;
      this.reset();
      this.lastCountAt = lastCountAt;
    }
    this.lastAt = at;
    if (this.warmupAt === null) this.warmupAt = at;
    if (this.state === 'CALIBRATING') {
      if (at - this.warmupAt < this.config.warmupMs) return this.snapshot(false, raw);
      this.samples.push({ raw, at });
      if (this.samples.length < this.config.calibrationSamples ||
          at - this.samples[0].at < this.config.calibrationSpanMs) return this.snapshot(false, raw);
      const mean = this.samples.reduce((sum, s) => sum + s.raw, 0) / this.samples.length;
      const variance = this.samples.reduce((sum, s) => sum + Math.pow(s.raw - mean, 2), 0) / this.samples.length;
      if (mean < this.config.minBaseline) return this.fault('TOO_DARK', raw);
      if (Math.sqrt(variance) / mean > this.config.maxCalibrationCv) return this.fault('UNSTABLE', raw);
      this.baseline = mean;
      this.filtered = mean;
      this.state = 'READY';
      return this.snapshot(false, raw);
    }
    this.filtered += this.config.alpha * (raw - this.filtered);
    const ratio = this.filtered / this.baseline;
    if (this.state === 'COUNT') this.state = 'READY';
    if (this.state === 'READY') {
      // 固定校准基准避免把遮挡吸收到基准；持续变亮要求重校准。
      if (ratio > 1.45) {
        if (this.driftAt === null) this.driftAt = at;
        if (at - this.driftAt >= 2000) return this.fault('ENVIRONMENT_CHANGED', raw);
      } else this.driftAt = null;
      if (ratio <= this.config.darkRatio) {
        if (this.darkAt === null) this.darkAt = at;
        if (at - this.darkAt >= this.config.minDarkMs) this.state = 'DARK';
      } else this.darkAt = null;
    } else {
      if (at - this.darkAt >= this.config.maxDarkMs) return this.fault('OCCLUSION_TIMEOUT', raw);
      if (ratio >= this.config.lightRatio) {
        if (this.state !== 'LIGHT') {
          this.state = 'LIGHT';
          this.lightAt = at;
        }
        if (at - this.lightAt >= this.config.minLightMs) {
          const counted = at - this.lastCountAt >= this.config.cooldownMs;
          this.state = counted ? 'COUNT' : 'READY';
          if (counted) this.lastCountAt = at;
          this.darkAt = null;
          this.lightAt = null;
          return this.snapshot(counted, raw);
        }
      } else {
        this.state = 'DARK';
        this.lightAt = null;
      }
    }
    return this.snapshot(false, raw);
  }
}

module.exports = { OpticalFSM };
