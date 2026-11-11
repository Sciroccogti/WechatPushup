// 加速度方向相对起始姿态的偏离估计，不代表标准动作角度。
const DEFAULT_SITUP = Object.freeze({ outAngle: 35, returnAngle: 12, stableMs: 140, minCycleMs: 700, maxCycleMs: 8000, cooldownMs: 900, alpha: 0.2, maxMagnitudeDelta: 0.3, rotationAxis: 'x', minRotation: 0.12 });
const FIELDS = Object.freeze([
  { key: 'outAngle', label: '离开起始姿态阈值', min: 20, max: 80, step: 1, scale: 1, unit: '°（估计）' },
  { key: 'returnAngle', label: '返回起始姿态阈值', min: 5, max: 30, step: 1, scale: 1, unit: '°（估计）' },
  { key: 'stableMs', label: '姿态稳定持续', min: 80, max: 400, step: 20, scale: 1, unit: 'ms' },
  { key: 'minCycleMs', label: '完整周期最短时间', min: 500, max: 2000, step: 100, scale: 1, unit: 'ms' },
  { key: 'maxCycleMs', label: '完整周期最长时间', min: 3000, max: 15000, step: 500, scale: 1, unit: 'ms' },
  { key: 'cooldownMs', label: '计数冷却', min: 300, max: 2500, step: 100, scale: 1, unit: 'ms' },
  { key: 'alpha', label: '加速度响应（越低越平滑）', min: 10, max: 80, step: 5, scale: 100, unit: '%' },
  { key: 'maxMagnitudeDelta', label: '允许偏离静止加速度幅值', min: 15, max: 60, step: 5, scale: 100, unit: '%' },
  { key: 'minRotation', label: '辅助往返旋转阈值（原始积分）', min: 5, max: 100, step: 5, scale: 100, unit: '' }
]);
function isValidSitup(value) {
  return !!value && ['x', 'auto'].includes(value.rotationAxis) && FIELDS.every((f) => Number.isFinite(value[f.key]) && value[f.key] * f.scale >= f.min - 0.001 && value[f.key] * f.scale <= f.max + 0.001) && value.outAngle >= value.returnAngle + 10;
}
const pickSitup = (value) => Object.keys(DEFAULT_SITUP).reduce((next, key) => { next[key] = value[key]; return next; }, {});
function changeSitup(current, key, input) {
  if (key === 'rotationAxis') return { ...current, rotationAxis: input === 'auto' ? 'auto' : 'x' };
  const field = FIELDS.find((item) => item.key === key);
  if (!field || !Number.isFinite(Number(input))) return { ...current };
  const next = { ...current, [key]: Math.max(field.min, Math.min(field.max, Math.round(Number(input) / field.step) * field.step)) / field.scale };
  if (key === 'outAngle') next.returnAngle = Math.min(next.returnAngle, next.outAngle - 10);
  if (key === 'returnAngle') next.outAngle = Math.max(next.outAngle, next.returnAngle + 10);
  return next;
}
const situpSliders = (value) => FIELDS.map((f) => ({ ...f, value: Math.round(value[f.key] * f.scale), display: f.unit === '' ? value[f.key].toFixed(2) : Math.round(value[f.key] * f.scale) }));
module.exports = { DEFAULT_SITUP, isValidSitup, pickSitup, changeSitup, situpSliders };
