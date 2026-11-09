// 实验用最小统一计数器，与训练计划无依赖。一次只接受一个主要来源。
class Counter {
  constructor(options) {
    this.minIntervalMs = (options && options.minIntervalMs) || 600;
    this.reset();
  }
  start(source) { this.source = source; this.running = true; this.touchHeld = false; }
  pause() { this.running = false; this.touchHeld = false; }
  resume() { this.running = true; }
  stop() { this.pause(); this.source = null; }
  reset() { this.count = 0; this.running = false; this.source = null; this.lastAt = -Infinity; this.touchHeld = false; }
  addCount(source, at) {
    if (!this.running || !Number.isFinite(at)) return false;
    if (source !== 'manual' && (source !== this.source || at - this.lastAt < this.minIntervalMs)) return false;
    this.count += 1;
    if (source !== 'manual') this.lastAt = at;
    return true;
  }
  undoCount() { this.count = Math.max(0, this.count - 1); return this.count; }
  getCount() { return this.count; }
  touchStart(at) {
    if (this.touchHeld || this.source !== 'touch') return false;
    this.touchHeld = true;
    return this.addCount('touch', at);
  }
  touchEnd() { this.touchHeld = false; }
}

module.exports = { Counter };
