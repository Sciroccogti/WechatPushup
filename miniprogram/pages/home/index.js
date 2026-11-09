const { APP_INFO } = require('../../config/app');
const { getExerciseViews } = require('../../utils/exercise-view');
const { PreferencesStore } = require('../../services/preferences');

Page({
  data: { appName: APP_INFO.name, exercises: getExerciseViews() },
  onShow() {
    const store = new PreferencesStore(wx);
    const prefs = store.load();
    this.setData({ exercises: getExerciseViews(prefs.recentExerciseIds, prefs.usageMs, prefs.sortMode), sortLabel: prefs.sortMode === 'duration' ? '累计训练时长优先' : '最近使用优先' });
  }
});
