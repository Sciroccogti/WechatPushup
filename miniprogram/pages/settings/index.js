const { APP_INFO } = require('../../config/app');

Page({
  data: { appName: APP_INFO.name, version: APP_INFO.version }
});
