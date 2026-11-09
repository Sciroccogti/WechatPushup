const { APP_INFO } = require('../../config/app');
const { getExerciseViews } = require('../../utils/exercise-view');

Page({
  data: { appName: APP_INFO.name, exercises: getExerciseViews() }
});
