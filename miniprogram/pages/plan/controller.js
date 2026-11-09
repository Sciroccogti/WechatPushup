const { getExerciseViewById } = require('../../utils/exercise-view');
const { TrainingStore } = require('../../services/training-store');
const { dateLabel } = require('../../utils/time');
const { getSession } = require('../../services/session-runtime');
module.exports = {
  data: { exercise: null, plan: null, nextTime: '', assessmentUrl: '', startUrl: '', freeUrl: '', message: '', resumeUrl: '' },
  onLoad(options) { this.setData({ exercise: getExerciseViewById(options && options.exerciseId) }); },
  onShow() {
    if (!this.data.exercise) return;
    const store = new TrainingStore(wx); const plan = store.plan(this.data.exercise.id, Date.now());
    const active = getSession();
    this.setData({ plan, nextTime: plan.nextTrainAt ? dateLabel(plan.nextTrainAt) : '', assessmentUrl: this.data.exercise.assessmentUrl,
      startUrl: '/pages/count-mode/index?purpose=plan&exerciseId=' + this.data.exercise.id, freeUrl: this.data.exercise.freeUrl, message: store.warning,
      resumeUrl: active && active.state !== 'finished' ? '/pages/' + (['rest', 'ready'].includes(active.state) || (active.state === 'paused' && ['rest', 'ready'].includes(active.pausedFrom)) ? 'rest' : 'training') + '/index?exerciseId=' + active.exerciseId + '&sessionId=' + active.id : '' });
  }
};
