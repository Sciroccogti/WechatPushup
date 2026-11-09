const { APP_INFO } = require('./config/app');

App({
  onLaunch() {
    if (typeof wx.onNeedPrivacyAuthorization === 'function') {
      wx.onNeedPrivacyAuthorization((resolve) => {
        const pages = getCurrentPages();
        const page = pages[pages.length - 1];
        if (page && typeof page.presentPrivacy === 'function') page.presentPrivacy(resolve);
        else resolve({ event: 'disagree' });
      });
    }
  },
  globalData: {
    appName: APP_INFO.name,
    appVersion: APP_INFO.version
  }
});
