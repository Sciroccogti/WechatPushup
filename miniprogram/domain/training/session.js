const clone = (value) => JSON.parse(JSON.stringify(value));

class TrainingSession {
  constructor({ id, exercise, purpose, plan, at }) {
    this.id = id; this.exerciseId = exercise.id; this.isTimed = exercise.measurement === 'duration';
    this.purpose = purpose || 'free'; this.deload = !!(plan && plan.deload);
    this.policyVersion = plan ? plan.policyVersion : null;
    this.groups = (plan ? plan.groups : [{ target: null, restSeconds: 0 }]).map((group) => Object.assign({}, group, { plannedTarget: group.target, actual: 0, workMs: 0, restMs: 0, status: 'pending' }));
    this.index = 0; this.state = 'idle'; this.activeMs = 0; this.startedAt = at; this.endedAt = null;
    this.lastAt = at; this.restUntil = null; this.modes = []; this.aborted = false; this.usageSavedMs = 0;
  }
  current() { return this.groups[this.index]; }
  start(at, mode) {
    if (!['idle', 'ready', 'paused'].includes(this.state)) return false;
    if (this.state === 'paused' && this.pausedFrom === 'rest') {
      this.state = 'rest'; this.restUntil = at + this.remainingRest; this.lastAt = at; return true;
    }
    if (this.state === 'ready') { this.tick(at); this.index += 1; }
    if (this.state === 'paused' && this.pausedFrom === 'ready') this.index += 1;
    if (!this.hasStarted) { this.startedAt = at; this.hasStarted = true; }
    this.state = 'working'; this.lastAt = at;
    if (mode && !this.modes.includes(mode)) this.modes.push(mode);
    return true;
  }
  tick(at) {
    if (!Number.isFinite(at) || at < this.lastAt) return;
    if (this.state === 'working') {
      const group = this.current();
      const remaining = this.isTimed && group.target !== null ? Math.max(0, group.target * 1000 - group.workMs) : Infinity;
      const delta = Math.min(at - this.lastAt, remaining);
      this.activeMs += delta; group.workMs += delta;
      this.lastAt += delta;
      if (this.isTimed) group.actual = Math.floor(group.workMs / 1000);
      if (this.isTimed && group.target !== null && group.actual >= group.target) this._finishSet(this.lastAt, false);
      else this.lastAt = at;
    }
    if (this.state === 'rest') {
      this.current().restMs += Math.max(0, at - this.lastAt); this.lastAt = at;
      if (at >= this.restUntil) { this.state = 'ready'; this.restUntil = null; this.lastAt = at; }
    }
    if (this.state === 'ready') { this.current().restMs += Math.max(0, at - this.lastAt); this.lastAt = at; }
  }
  add(at) {
    if (this.state !== 'working' || this.isTimed) return false;
    this.tick(at); this.current().actual += 1;
    if (this.current().target !== null && this.current().actual >= this.current().target) this._finishSet(at, false);
    return true;
  }
  undo(at) {
    if (this.isTimed || this.state !== 'working' || this.current().actual < 1) return false;
    this.tick(at); this.current().actual -= 1; return true;
  }
  _finishSet(at, skipped) {
    this.current().status = skipped ? 'skipped' : 'completed';
    if (this.index === this.groups.length - 1) { this.state = 'finished'; this.endedAt = at; }
    else { this.state = 'rest'; this.lastAt = at; this.restUntil = at + this.current().restSeconds * 1000; }
  }
  finishSet(at, skipped) {
    if (!['working', 'idle'].includes(this.state)) return false;
    this.tick(at);
    if (this.state !== 'working' && this.state !== 'idle') return false;
    this._finishSet(at, !!skipped); return true;
  }
  pause(at) {
    this.tick(at);
    if (!['idle', 'working', 'rest', 'ready'].includes(this.state)) return false;
    this.pausedFrom = this.state;
    if (this.state === 'rest') this.remainingRest = Math.max(0, this.restUntil - at);
    this.state = 'paused'; this.lastAt = at; return true;
  }
  endRest(at) { this.tick(at); if (this.state === 'rest') { this.state = 'ready'; this.restUntil = null; } }
  resumeRest(at) {
    if (this.state !== 'paused' || !['rest', 'ready'].includes(this.pausedFrom)) return;
    this.state = this.pausedFrom; this.lastAt = at;
    if (this.state === 'rest') this.restUntil = at + this.remainingRest;
  }
  extendRest(at, seconds) {
    this.tick(at);
    if (this.state === 'rest' && Number.isFinite(seconds) && seconds > 0) this.restUntil += seconds * 1000;
  }
  setTarget(value, at) {
    if (!Number.isInteger(value) || value < 1 || value > (this.isTimed ? 3600 : 1000) || this.purpose !== 'plan' || !['idle', 'working', 'paused'].includes(this.state)) return false;
    this.tick(at);
    if (!['idle', 'working', 'paused'].includes(this.state)) return false;
    this.current().target = value;
    if (this.state === 'working' && this.current().actual >= value) this._finishSet(at, false);
    return true;
  }
  finish(at, aborted) {
    this.tick(at);
    if (this.state !== 'finished') {
      if (!aborted && this.purpose !== 'plan') this.current().status = 'completed';
      this.state = 'finished'; this.endedAt = at; this.aborted = !!aborted;
    }
  }
  result(fatigue) {
    if (this.state !== 'finished' || !Number.isInteger(fatigue) || fatigue < 1 || fatigue > 5) throw new Error('INVALID_SESSION_RESULT');
    const planned = this.groups.reduce((sum, group) => sum + (group.target || 0), 0);
    const actual = this.groups.reduce((sum, group) => sum + group.actual, 0);
    return clone({ id: this.id, exerciseId: this.exerciseId, purpose: this.purpose, deload: this.deload, policyVersion: this.policyVersion,
      startedAt: this.startedAt, endedAt: this.endedAt, activeMs: this.activeMs, groups: this.groups,
      planned, actual, completion: planned ? actual / planned : null, aborted: this.aborted, fatigue, modes: this.modes });
  }
}
module.exports = { TrainingSession };
