const { APP_INFO } = require('../../config/app');
const { getExerciseViews, getExerciseSelection } = require('../../utils/exercise-view');
const { PreferencesStore } = require('../../services/preferences');

Page({
  data: { appName: APP_INFO.name, exercises: getExerciseViews(), sortOptions: ['累计训练时长', '最近使用'], sortIndex: 0, storageWarning: '' },
  onShow() {
    const store = new PreferencesStore(wx);
    const prefs = store.load();
    this.setData(Object.assign(getExerciseSelection(prefs), { storageWarning: store.warning }));
  },
  onSortChange(event) {
    const store = new PreferencesStore(wx);
    store.setSortMode(Number(event.detail.value) === 0 ? 'duration' : 'recent');
    this.setData(Object.assign(getExerciseSelection(store.value), { storageWarning: store.warning }));
  }
});
