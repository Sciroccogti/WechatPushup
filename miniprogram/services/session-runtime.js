const { TrainingSession } = require('../domain/training/session');
let active = null;
let sequence = 0;
function beginSession(exercise, purpose, plan, at) {
  if (active && active.state !== 'finished') throw new Error('SESSION_ALREADY_ACTIVE');
  active = new TrainingSession({ id: at.toString(36) + '-' + Math.random().toString(36).slice(2, 10) + '-' + (++sequence), exercise, purpose, plan, at });
  return active;
}
function getSession(id) { return active && (!id || active.id === id) ? active : null; }
function clearSession(id) { if (active && active.id === id) active = null; }
module.exports = { beginSession, getSession, clearSession };
