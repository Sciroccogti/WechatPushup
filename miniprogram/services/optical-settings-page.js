const { APP_INFO } = require('../config/app');
const { withOpticalPage } = require('./optical-page');
const { PreferencesStore } = require('./preferences');

function createOpticalSettingsPage() {
  return withOpticalPage({
    allowSimulation: true,
    data: { appName: APP_INFO.name, version: APP_INFO.version, sortOptions: ['累计训练时长', '最近使用'], sortIndex: 0 },
    onShow() { const store = new PreferencesStore(wx); this.setData({ sortIndex: store.load().sortMode === 'duration' ? 0 : 1 }); },
    onSortChange(event) { this._prefs.setSortMode(Number(event.detail.value) === 0 ? 'duration' : 'recent'); this.setData({ sortIndex: Number(event.detail.value), storageMessage: this._prefs.warning }); }
  });
}

module.exports = { createOpticalSettingsPage };
