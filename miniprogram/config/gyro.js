// 原始角速度及其时间积分的实验阈值；不推断官方未标明的物理单位。
const DEFAULT_GYRO = Object.freeze({ axis: 'x', minRate: 0.4, minAngle: 0.25, stableMs: 120, cooldownMs: 900, maxCycleMs: 6000, alpha: 0.35 });
const GYRO_EXERCISES = Object.freeze(['sit-up', 'squat']);
const GYRO_AXES = Object.freeze(['胸前竖向（X轴）', '自动选轴']);
const FIELDS = Object.freeze([
  { key: 'minRate', label: '启动 / 反向速度阈值', min: 10, max: 200, step: 5, scale: 100, unit: '' },
  { key: 'minAngle', label: '最小往返幅度（信号积分）', min: 10, max: 200, step: 5, scale: 100, unit: '' },
  { key: 'stableMs', label: '方向稳定持续', min: 60, max: 400, step: 20, scale: 1, unit: 'ms' },
  { key: 'cooldownMs', label: '两次计数冷却', min: 300, max: 2500, step: 100, scale: 1, unit: 'ms' },
  { key: 'maxCycleMs', label: '完整周期最长时间', min: 2000, max: 12000, step: 500, scale: 1, unit: 'ms' },
  { key: 'alpha', label: '信号响应（越低越平滑）', min: 10, max: 100, step: 5, scale: 100, unit: '%' }
]);
function isValidGyro(value) {
  return !!value && ['x', 'auto'].includes(value.axis) && FIELDS.every((field) =>
    Number.isFinite(value[field.key]) && value[field.key] * field.scale >= field.min - 0.001 && value[field.key] * field.scale <= field.max + 0.001);
}
function pickGyro(value) { return Object.keys(DEFAULT_GYRO).reduce((next, key) => { next[key] = value[key]; return next; }, {}); }
function changeGyro(current, key, input) {
  if (key === 'axis') return { ...current, axis: input === 'auto' ? 'auto' : 'x' };
  const field = FIELDS.find((item) => item.key === key);
  if (!field || !Number.isFinite(Number(input))) return { ...current };
  return { ...current, [key]: Math.max(field.min, Math.min(field.max, Math.round(Number(input) / field.step) * field.step)) / field.scale };
}
function gyroSliders(value) {
  return FIELDS.map((field) => ({ ...field, value: Math.round(value[field.key] * field.scale), display: field.scale === 100 && field.unit !== '%' ? value[field.key].toFixed(2) : Math.round(value[field.key] * field.scale) }));
}
module.exports = { DEFAULT_GYRO, GYRO_EXERCISES, GYRO_AXES, isValidGyro, pickGyro, changeGyro, gyroSliders };
