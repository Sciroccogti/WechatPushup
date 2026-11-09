// 相对基准亮度的比值，不是 lux。实验默认值，待逐机型验证。
const DEFAULT_OPTICAL = Object.freeze({ darkRatio: 0.62, lightRatio: 0.82, minDarkMs: 250, minLightMs: 250, cooldownMs: 900, alpha: 0.35 });
const FIELDS = Object.freeze([
  { key: 'darkRatio', label: '遮挡阈值', min: 10, max: 90, step: 1, scale: 100, unit: '%' },
  { key: 'lightRatio', label: '恢复阈值', min: 15, max: 98, step: 1, scale: 100, unit: '%' },
  { key: 'minDarkMs', label: '遮挡最短持续', min: 100, max: 1000, step: 50, scale: 1, unit: 'ms' },
  { key: 'minLightMs', label: '恢复最短持续', min: 100, max: 1000, step: 50, scale: 1, unit: 'ms' },
  { key: 'cooldownMs', label: '两次计数冷却', min: 300, max: 2500, step: 100, scale: 1, unit: 'ms' },
  { key: 'alpha', label: '信号响应（越低越平滑）', min: 10, max: 100, step: 5, scale: 100, unit: '%' }
]);

function isValidOptical(value) {
  return !!value && FIELDS.every((field) => typeof value[field.key] === 'number' && Number.isFinite(value[field.key]) &&
    value[field.key] * field.scale >= field.min - 0.001 && value[field.key] * field.scale <= field.max + 0.001) &&
    value.lightRatio - value.darkRatio >= 0.0499;
}

function changeOptical(current, key, input) {
  const field = FIELDS.find((item) => item.key === key);
  if (!field || !Number.isFinite(Number(input))) return Object.assign({}, current);
  const value = Math.max(field.min, Math.min(field.max, Math.round(Number(input) / field.step) * field.step)) / field.scale;
  const next = Object.assign({}, current, { [key]: value });
  // 始终保留至少 5% 迟滞；移动一个阈值可能同步移动另一个。
  if (key === 'darkRatio' && next.lightRatio < value + 0.05) next.lightRatio = Math.round((value + 0.05) * 100) / 100;
  if (key === 'lightRatio' && next.darkRatio > value - 0.05) next.darkRatio = Math.round((value - 0.05) * 100) / 100;
  return next;
}

function opticalSliders(settings) {
  return FIELDS.map((field) => Object.assign({}, field, { value: Math.round(settings[field.key] * field.scale) }));
}

module.exports = { DEFAULT_OPTICAL, isValidOptical, changeOptical, opticalSliders };
