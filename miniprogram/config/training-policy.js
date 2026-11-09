// 产品策略参数，不是经过临床验证的个体处方；可单独调整与模拟。
const POLICY = Object.freeze({
  version: 1, setRatios: [0.30, 0.35, 0.30, 0.25, 0.35],
  recoveryMs: 48 * 3600000, highFatigueRecoveryMs: 72 * 3600000,
  progressionWindow: 3, goodCompletion: 0.95, lowCompletion: 0.70,
  increaseFactor: 1.05, decreaseFactor: 0.90, minLevel: 0.65, maxLevel: 1.5,
  deloadEvery: 8, deloadFactor: 0.70, reassessEvery: 12,
  returnAfterMs: 14 * 86400000, returnFactor: 0.80,
  restBaseSeconds: 45, restRatioSeconds: 60, restSetStepSeconds: 15, maxRestSeconds: 180,
  maxRepetitions: 1000, maxSeconds: 3600, recentLimit: 12
});
module.exports = { POLICY };
