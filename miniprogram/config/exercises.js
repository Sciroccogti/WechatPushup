// 稳定 ID 用于后续独立维护计划与历史；这里只定义项目，不承诺计数能力。
const EXERCISES = Object.freeze([
  Object.freeze({ id: 'push-up', name: '俯卧撑', measurement: 'repetitions', unit: '次', sensor: 'optical', description: '触屏 / 光学计数' }),
  Object.freeze({ id: 'sit-up', name: '仰卧起坐', measurement: 'repetitions', unit: '次', sensor: 'motion', description: '加速度主导 / 旋转辅助 / 触屏计数' }),
  Object.freeze({ id: 'squat', name: '深蹲', measurement: 'repetitions', unit: '次', sensor: 'gyro', description: '触屏 / 陀螺仪计数' }),
  Object.freeze({ id: 'plank', name: '平板支撑', measurement: 'duration', unit: '秒', sensor: null, description: '按秒记录每组坚持时间' })
]);

function getExerciseById(id) {
  return EXERCISES.find((exercise) => exercise.id === id) || null;
}

module.exports = { EXERCISES, getExerciseById };
