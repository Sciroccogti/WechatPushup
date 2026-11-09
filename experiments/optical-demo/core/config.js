// 实验起点，不代表经过真机验证的参数。亮度范围 0..255，不是 lux。
const DEFAULTS = Object.freeze({
  warmupMs: 1000,
  calibrationSamples: 20,
  calibrationSpanMs: 1800,
  minBaseline: 18,
  maxCalibrationCv: 0.12,
  alpha: 0.35,
  minDarkMs: 250,
  minLightMs: 250,
  cooldownMs: 900,
  maxDarkMs: 6000,
  maxGapMs: 600,
  sampleIntervalMs: 100,
  silenceTimeoutMs: 3000,
  startupTimeoutMs: 12000
});

function thresholds(sensitivity) {
  const level = Math.max(1, Math.min(100, Number(sensitivity) || 50));
  const darkRatio = 0.45 + level * 0.0035;
  return { darkRatio, lightRatio: Math.min(0.95, darkRatio + 0.18) };
}

module.exports = { DEFAULTS, thresholds };
