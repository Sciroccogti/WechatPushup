const { APP_INFO } = require('../config/app');
const { withOpticalPage } = require('./optical-page');

function createOpticalSettingsPage() {
  return withOpticalPage({
    allowSimulation: true,
    data: { appName: APP_INFO.name, version: APP_INFO.version }
  });
}

module.exports = { createOpticalSettingsPage };
