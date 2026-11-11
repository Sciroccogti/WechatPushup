const { getExerciseViewById } = require('../../utils/exercise-view');
module.exports = {
  data: { exercise: null, modes: [] },
  onLoad(options) {
    const exercise = getExerciseViewById(options && options.exerciseId);
    if (!exercise) return;
    const purpose = ['plan', 'assessment'].includes(options.purpose) ? options.purpose : 'free';
    const modes = exercise.isTimed ? [{ id: 'timer', label: '计时器', detail: '按秒计时，无需传感器' }] : [
      { id: 'touch', label: '触屏 / 手动', detail: '无需传感器，支持手动纠错' },
      exercise.sensor === 'optical' ? { id: 'optical', label: '光学（实验）', detail: '仅俯卧撑，前置摄像头明暗周期' } : exercise.sensor === 'motion' ? { id: 'motion', label: '加速度主导 · 旋转辅助（实验）', detail: '手机固定胸前，在起始姿态静止校准；触屏可同时补数' } : { id: 'gyro', label: '陀螺仪（实验）', detail: '手机竖向固定胸前/上身，检测往返转动' }
    ];
    this.setData({ exercise, modes: modes.map((mode) => Object.assign({}, mode, { url: '/pages/training/index?exerciseId=' + exercise.id + '&purpose=' + purpose + '&mode=' + mode.id })) });
  }
};
