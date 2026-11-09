const { getExerciseViews } = require('../../utils/exercise-view');

const exercises = getExerciseViews();

Page({
  data: {
    sections: [
      { id: 'repetitions', title: '计次训练', description: '用次数记录每组完成量', exercises: exercises.filter((item) => !item.isTimed) },
      { id: 'duration', title: '计时训练', description: '用时间记录每组坚持', exercises: exercises.filter((item) => item.isTimed) }
    ]
  }
});
