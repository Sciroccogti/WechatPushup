const { getExerciseViews } = require('../../utils/exercise-view');
const { PreferencesStore } = require('../../services/preferences');

Page({
  data: { exercises: getExerciseViews(), storageWarning: '', sortIndex: 0, sortOptions: ['累计训练时长', '最近使用'] },
  onShow() {
    const store = new PreferencesStore(wx);
    const prefs = store.load();
    this.setData({ exercises: getExerciseViews(prefs.recentExerciseIds, prefs.usageMs, prefs.sortMode), sortIndex: prefs.sortMode === 'duration' ? 0 : 1, storageWarning: store.warning });
  },
  onSortChange(event) {
    const store = new PreferencesStore(wx);
    store.setSortMode(Number(event.detail.value) === 0 ? 'duration' : 'recent');
    const prefs = store.value;
    this.setData({ exercises: getExerciseViews(prefs.recentExerciseIds, prefs.usageMs, prefs.sortMode), sortIndex: prefs.sortMode === 'duration' ? 0 : 1, storageWarning: store.warning });
  }
});
