App({
  onLaunch() {
    // 应用级监听仅注册一次；当前实验只有一个页面。
    if (typeof wx.onNeedPrivacyAuthorization === 'function') {
      wx.onNeedPrivacyAuthorization((resolve) => {
        const pages = getCurrentPages();
        const page = pages[pages.length - 1];
        if (page && typeof page.presentPrivacy === 'function') {
          page.presentPrivacy(resolve);
        } else {
          resolve({ event: 'disagree' });
        }
      });
    }
  }
});
