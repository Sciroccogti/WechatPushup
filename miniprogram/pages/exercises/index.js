const { getExerciseViews } = require('../../utils/exercise-view');
const { PreferencesStore } = require('../../services/preferences');

Page({
  data: { exercises: getExerciseViews(), storageWarning: '' },
  onShow() {
    const store = new PreferencesStore(wx);
    this.setData({ exercises: getExerciseViews(store.load().recentExerciseIds), storageWarning: store.warning });
  }
});
