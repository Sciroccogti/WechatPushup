const SOURCES = ['touch', 'optical', 'gyro'];

class CounterManager {
  constructor(options) {
    this.minIntervalMs = options && options.minIntervalMs !== undefined ? options.minIntervalMs : 600;
    this.reset();
  }
  start(source) {
    if (!SOURCES.includes(source)) throw new Error('INVALID_COUNT_SOURCE');
    this.source = source;
    this.running = true;
    this.held = false;
  }
  pause() { this.running = false; this.held = false; }
  resume() { if (this.source) this.running = true; }
  stop() { this.pause(); this.source = null; }
  reset() { this.count = 0; this.running = false; this.source = null; this.lastAt = -Infinity; this.held = false; }
  addCount(source, at) {
    if (!this.running || !Number.isFinite(at)) return false;
    if (source !== 'manual' && (source !== this.source || at - this.lastAt < this.minIntervalMs)) return false;
    this.count += 1;
    if (source !== 'manual') this.lastAt = at;
    return true;
  }
  undoCount() { this.count = Math.max(0, this.count - 1); return this.count; }
  getCount() { return this.count; }
  touchStart(at, contacts) {
    if (this.source !== 'touch' || this.held) return false;
    this.held = true;
    if (contacts !== 1) return false;
    return this.addCount('touch', at);
  }
  touchEnd(remaining) { if (!remaining) this.held = false; }
}

module.exports = { CounterManager };
