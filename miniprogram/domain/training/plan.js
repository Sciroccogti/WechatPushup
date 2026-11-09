const { POLICY } = require('../../config/training-policy');

function assess(exercise, maximum, at, previous) {
  const limit = exercise.measurement === 'duration' ? POLICY.maxSeconds : POLICY.maxRepetitions;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > limit || !Number.isFinite(at)) throw new Error('INVALID_ASSESSMENT');
  return Object.assign({}, previous, {
    exerciseId: exercise.id, maximum, assessedAt: at, level: 1, sinceAssessment: 0,
    completedSessions: previous ? previous.completedSessions : 0,
    recent: [], progressionStreak: 0, nextTrainAt: previous ? previous.nextTrainAt : at,
    lastTrainAt: previous ? previous.lastTrainAt : null, reason: '已按本次能力评估重新设置起点。'
  });
}

function generatePlan(exercise, profile, at, policy = POLICY) {
  if (!profile || !profile.maximum) return { needsAssessment: true, exerciseId: exercise.id, groups: [], reasons: ['先记录当前能力，再生成个人训练目标。'] };
  const recovery = at < profile.nextTrainAt;
  const deload = (profile.completedSessions + 1) % policy.deloadEvery === 0;
  const returning = profile.lastTrainAt !== null && at - profile.lastTrainAt >= policy.returnAfterMs;
  const factor = profile.level * (deload ? policy.deloadFactor : 1) * (returning ? policy.returnFactor : 1);
  const reasons = [profile.reason || '按当前能力安排，未训练不会自动升级。'];
  if (recovery) reasons.unshift('目前为恢复期，建议到下一训练日再进行计划训练。');
  if (deload) reasons.push('本次进入周期减量，暂时降低训练量。');
  if (returning) reasons.push('距离上次训练较久，先降低训练量恢复节奏。');
  const reassessDue = profile.sinceAssessment >= policy.reassessEvery;
  if (reassessDue) reasons.push('已完成一个评估周期，建议重新测试当前能力。');
  const groups = policy.setRatios.map((ratio, index) => {
    const target = Math.max(1, Math.min(profile.maximum, Math.round(profile.maximum * ratio * factor)));
    const restSeconds = index === policy.setRatios.length - 1 ? 0 : Math.min(policy.maxRestSeconds,
      Math.ceil((policy.restBaseSeconds + target / profile.maximum * policy.restRatioSeconds + index * policy.restSetStepSeconds) / 15) * 15);
    return { target, restSeconds };
  });
  return { needsAssessment: false, exerciseId: exercise.id, policyVersion: policy.version,
    groups, recovery, nextTrainAt: profile.nextTrainAt, deload, returning, reassessDue,
    total: groups.reduce((sum, group) => sum + group.target, 0), reasons };
}

function adjustProgress(profile, result, policy = POLICY) {
  if (!profile || result.purpose !== 'plan') return profile;
  const next = JSON.parse(JSON.stringify(profile));
  const actual = result.groups.reduce((sum, group) => sum + group.actual, 0);
  const planned = result.groups.reduce((sum, group) => sum + group.target, 0);
  const completion = planned ? Math.min(1, actual / planned) : 0;
  const exposed = actual > 0 || result.activeMs > 0;
  if (!exposed) { next.reason = '本次没有有效训练量，保持目标，不推进训练周期。'; return next; }
  const previousAt = next.lastTrainAt;
  const tooSoon = previousAt !== null && result.startedAt - previousAt < policy.recoveryMs;
  const complete = !result.aborted && result.groups.every((group) => group.status === 'completed');
  next.recent = [...next.recent, { id: result.id, at: result.endedAt, completion, fatigue: result.fatigue, complete }].slice(-policy.recentLimit);
  if (complete) { next.completedSessions += 1; next.sinceAssessment += 1; }
  const recent = next.recent.slice(-policy.progressionWindow);
  const good = complete && completion >= policy.goodCompletion && result.fatigue <= 2 && !result.deload && !tooSoon;
  next.progressionStreak = good ? (next.progressionStreak || 0) + 1 : 0;
  if (result.fatigue >= 4 || completion < policy.lowCompletion || result.aborted) {
    next.level = Math.max(policy.minLevel, next.level * policy.decreaseFactor);
    next.reason = result.fatigue >= 4 ? '主观疲劳较高，下次降低训练量并延长恢复。' : '本次完成不足或提前结束，下次降低训练量。';
  } else if (next.progressionStreak >= policy.progressionWindow && recent.length === policy.progressionWindow &&
      recent.every((item) => item.complete && item.completion >= policy.goodCompletion && item.fatigue <= 2)) {
    next.level = Math.min(policy.maxLevel, next.level * policy.increaseFactor);
    next.reason = next.level > profile.level ? '近期稳定完成且疲劳较低，小幅上调训练系数；次数取整后可能保持不变。' : '已达到当前策略的训练系数上限，保持目标并建议重新评估能力。';
    // 每次上调后重新积累稳定表现，保留原始完成标记。
    next.progressionStreak = 0;
  } else {
    next.reason = tooSoon ? '恢复间隔偏短，保持训练量并安排恢复日。' : result.deload ? '减量训练完成，下一次恢复常规训练量。' : '继续积累近期表现，本次保持训练量。';
  }
  next.lastTrainAt = result.endedAt;
  next.nextTrainAt = result.endedAt + (result.fatigue >= 4 || tooSoon ? policy.highFatigueRecoveryMs : policy.recoveryMs);
  return next;
}

module.exports = { assess, generatePlan, adjustProgress };
