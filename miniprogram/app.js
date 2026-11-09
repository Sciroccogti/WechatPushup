const { APP_INFO } = require('./config/app');

// 阶段 1 仅提供应用壳；登录、存储与硬件不在启动时初始化。
App({
  globalData: {
    appName: APP_INFO.name,
    appVersion: APP_INFO.version
  }
});
