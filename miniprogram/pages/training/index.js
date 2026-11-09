const { getExerciseViewById } = require('../../utils/exercise-view');

Page({
  data: { exercise: null },

  onLoad(options) {
    // 没有有效项目参数时显示选择入口，不默认为俯卧撑。
    this.setData({ exercise: getExerciseViewById(options && options.exerciseId) });
  }
});
