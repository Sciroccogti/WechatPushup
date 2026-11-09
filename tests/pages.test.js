const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRuntime } = require('./helpers/runtime');

function loadPage(name) {
  return createRuntime().loadPage(name);
}

test('首页/项目列表的全部入口均能加载对应运动，不串项目或单位', () => {
  const home = loadPage('home');
  const selection = loadPage('exercises');
  const cards = selection.data.exercises;
  assert.deepEqual(home.data.exercises.map((item) => item.id), ['push-up', 'sit-up', 'squat', 'plank']);
  assert.deepEqual(cards.map((item) => item.id), home.data.exercises.map((item) => item.id));
  const app = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../miniprogram/app.json'), 'utf8'));
  for (const card of [...cards, ...home.data.exercises]) {
    const url = new URL(card.trainingUrl, 'https://local.invalid');
    assert.ok(app.pages.includes(url.pathname.slice(1)));
    const training = loadPage('training');
    training.onLoad(Object.fromEntries(url.searchParams));
    assert.equal(training.data.exercise.id, card.id);
    assert.equal(training.data.exercise.name, card.name);
    assert.equal(training.data.exercise.unit, card.unit);
  }
});

test('计次与平板支撑展示语义独立，返回值不能修改运动配置', () => {
  const { EXERCISES } = require('../miniprogram/config/exercises');
  const training = loadPage('training');
  for (const id of ['push-up', 'sit-up', 'squat']) {
    training.onLoad({ exerciseId: id });
    assert.equal(training.data.exercise.unit, '次');
    assert.equal(training.data.exercise.isTimed, false);
    assert.equal(training.data.exercise.currentLabel, '本组次数');
  }
  training.onLoad({ exerciseId: 'plank' });
  assert.equal(training.data.exercise.unit, '秒');
  assert.equal(training.data.exercise.isTimed, true);
  assert.equal(training.data.exercise.currentLabel, '本组用时');
  training.data.exercise.unit = 'changed';
  assert.equal(EXERCISES.find((item) => item.id === 'plank').unit, '秒');
  training.onLoad({ exerciseId: 'plank' });
  assert.equal(training.data.exercise.unit, '秒');
});

test('缺失/异常项目参数进入选择状态，并清除已有项目而不误开训练', () => {
  const training = loadPage('training');
  for (const options of [undefined, null, {}, { exerciseId: '' }, { exerciseId: 'unknown' },
    { exerciseId: '__proto__' }, { exerciseId: ['plank'] }, { exerciseId: 1 }, { exerciseId: '../home' }]) {
    training.onLoad({ exerciseId: 'push-up' });
    assert.equal(training.data.exercise.id, 'push-up');
    training.onLoad(options);
    assert.equal(training.data.exercise, null);
  }
});

test('选择/更换项目反复切换不会积累页面栈，首页快速入口可原路返回', () => {
  const readTemplate = (name) => fs.readFileSync(path.resolve(__dirname, '../miniprogram/pages/' + name + '/index.wxml'), 'utf8');
  function getNavigator(name, url) {
    const match = [...readTemplate(name).matchAll(/<navigator\b([^>]*)>/g)].find(([, attributes]) => attributes.includes('url="' + url + '"'));
    assert.ok(match, name + ' needs navigator ' + url);
    return (match[1].match(/open-type="([^"]+)"/) || [null, 'navigate'])[1];
  }
  const selectType = getNavigator('exercises', '{{item.trainingUrl}}');
  const changeType = getNavigator('training', '/pages/exercises/index');
  let stack = ['home', 'exercises'];
  const visit = (type, target) => { if (type === 'redirect') stack[stack.length - 1] = target; else stack.push(target); };
  for (let i = 0; i < 30; i += 1) { visit(selectType, 'training'); visit(changeType, 'exercises'); }
  assert.deepEqual(stack, ['home', 'exercises']);
  assert.equal(getNavigator('home', '{{item.trainingUrl}}'), 'navigate');
  assert.equal(getNavigator('home', '/pages/history/index'), 'switchTab');
});
