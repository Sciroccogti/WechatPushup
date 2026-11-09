const { EXERCISES, getExerciseById } = require('../config/exercises');

// 仅转换展示字段与路由；计数、目标生成和训练进度属于 domain/。
function toExerciseView(exercise, index) {
  const isTimed = exercise.measurement === 'duration';
  return Object.assign({}, exercise, {
    number: index < 9 ? '0' + (index + 1) : String(index + 1),
    isTimed,
    typeLabel: isTimed ? '计时' : '计次',
    currentLabel: isTimed ? '本组用时' : '本组次数',
    totalLabel: isTimed ? '累计支撑时间' : '累计完成次数',
    trainingUrl: '/pages/training/index?exerciseId=' + encodeURIComponent(exercise.id)
  });
}

function getExerciseViews() {
  return EXERCISES.map(toExerciseView);
}

function getExerciseViewById(id) {
  if (typeof id !== 'string') return null;
  const exercise = getExerciseById(id);
  return exercise ? toExerciseView(exercise, EXERCISES.indexOf(exercise)) : null;
}

module.exports = { getExerciseViews, getExerciseViewById };
