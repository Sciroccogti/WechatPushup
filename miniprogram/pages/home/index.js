const { APP_INFO } = require('../../config/app');
const { getExerciseViews } = require('../../utils/exercise-view');
const { PreferencesStore } = require('../../services/preferences');

Page({
  data: { appName: APP_INFO.name, exercises: getExerciseViews() },
  onShow() {
    const store = new PreferencesStore(wx);
    this.setData({ exercises: getExerciseViews(store.load().recentExerciseIds) });
  }
});
