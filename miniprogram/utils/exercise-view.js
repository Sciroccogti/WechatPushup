const { EXERCISES, getExerciseById } = require('../config/exercises');
const { durationLabel } = require('./time');

// 仅转换展示字段与路由；计数、目标生成和训练进度属于 domain/。
function toExerciseView(exercise, index) {
  const isTimed = exercise.measurement === 'duration';
  return Object.assign({}, exercise, {
    number: index < 9 ? '0' + (index + 1) : String(index + 1),
    isTimed,
    typeLabel: isTimed ? '计时' : '计次',
    currentLabel: isTimed ? '本组用时' : '本组次数',
    totalLabel: isTimed ? '累计支撑时间' : '累计完成次数',
    trainingUrl: '/pages/plan/index?exerciseId=' + encodeURIComponent(exercise.id),
    freeUrl: '/pages/training/index?purpose=free&exerciseId=' + encodeURIComponent(exercise.id),
    assessmentUrl: '/pages/assessment/index?exerciseId=' + encodeURIComponent(exercise.id)
  });
}

function getExerciseViews(recentIds, usageMs, sortMode) {
  const recent = Array.isArray(recentIds) ? recentIds : [];
  const usage = usageMs || {};
  return EXERCISES.map((exercise, index) => Object.assign(toExerciseView(exercise, index), {
    usageLabel: '累计训练 ' + durationLabel(usage[exercise.id] || 0)
  })).sort((a, b) => {
    if (sortMode === 'duration' && (usage[a.id] || 0) !== (usage[b.id] || 0)) return (usage[b.id] || 0) - (usage[a.id] || 0);
    const rank = (id) => recent.includes(id) ? recent.indexOf(id) : recent.length;
    return rank(a.id) - rank(b.id) || EXERCISES.findIndex((item) => item.id === a.id) - EXERCISES.findIndex((item) => item.id === b.id);
  });
}

function getExerciseViewById(id) {
  if (typeof id !== 'string') return null;
  const exercise = getExerciseById(id);
  return exercise ? toExerciseView(exercise, EXERCISES.indexOf(exercise)) : null;
}

module.exports = { getExerciseViews, getExerciseViewById };
