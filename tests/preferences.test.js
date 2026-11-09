const test = require('node:test');
const assert = require('node:assert/strict');
const { PreferencesStore, PREFERENCES_KEY } = require('../miniprogram/services/preferences');
const { DEFAULT_OPTICAL, changeOptical, isValidOptical } = require('../miniprogram/config/optical');
const { getExerciseViews } = require('../miniprogram/utils/exercise-view');
const { createRuntime } = require('./helpers/runtime');

test('最近使用去重、持久化，已使用优先，未使用保持配置顺序', () => {
  const runtime = createRuntime();
  const store = new PreferencesStore(runtime.wx);
  store.load();
  for (const id of ['plank', 'squat', 'plank']) store.markUsed(id);
  assert.deepEqual(getExerciseViews(store.value.recentExerciseIds).map((e) => e.id), ['plank', 'squat', 'push-up', 'sit-up']);
  assert.equal(store.markUsed('unknown'), false);
  const reloaded = new PreferencesStore(runtime.wx).load();
  assert.deepEqual(reloaded.recentExerciseIds, ['plank', 'squat']);
  assert.equal(runtime.storage.get(PREFERENCES_KEY).schemaVersion, 1);
});

test('训练页选用即更新排序，首页与列表onShow读取新顺序，无效入口不写入', () => {
  const runtime = createRuntime();
  const home = runtime.openPage('home');
  const selection = runtime.openPage('exercises');
  const training = runtime.openPage('training', { exerciseId: 'plank' });
  training.onUnload();
  home.onShow(); selection.onShow();
  assert.equal(home.data.exercises[0].id, 'plank');
  assert.equal(selection.data.exercises[0].id, 'plank');
  assert.equal(selection.data.sections, undefined);
  const writes = runtime.calls.writes;
  runtime.openPage('training', { exerciseId: 'unknown' }).onUnload();
  assert.equal(runtime.calls.writes, writes);
});

test('光学参数保存与最近使用共存；副本修改不污染已存值', () => {
  const runtime = createRuntime();
  const store = new PreferencesStore(runtime.wx);
  store.load(); store.markUsed('push-up');
  const next = changeOptical(DEFAULT_OPTICAL, 'darkRatio', 70);
  assert.equal(store.saveOptical(next), true);
  next.darkRatio = 0;
  const value = new PreferencesStore(runtime.wx).load();
  assert.equal(value.optical.darkRatio, 0.7);
  assert.deepEqual(value.recentExerciseIds, ['push-up']);
});

test('持久化参数只接受公开调节字段，不将未知配置传入状态机', () => {
  const runtime = createRuntime({ storage: new Map([[PREFERENCES_KEY, {
    schemaVersion: 1, recentExerciseIds: [], optical: { ...DEFAULT_OPTICAL, warmupMs: -1, baseline: 99 }
  }]]) });
  const settings = new PreferencesStore(runtime.wx).load().optical;
  assert.equal(settings.warmupMs, undefined); assert.equal(settings.baseline, undefined);
});

test('损坏/未来版本与读取失败不覆盖原数据，写满时保留临时值并反馈', () => {
  for (const invalid of [null, { schemaVersion: 2 }, { schemaVersion: 1, optical: DEFAULT_OPTICAL, recentExerciseIds: [null] }]) {
    const runtime = createRuntime({ storage: new Map([[PREFERENCES_KEY, invalid]]) });
    const store = new PreferencesStore(runtime.wx); store.load();
    assert.equal(store.saveOptical(DEFAULT_OPTICAL), false);
    assert.equal(runtime.calls.writes, 0);
    assert.deepEqual(runtime.storage.get(PREFERENCES_KEY), invalid);
    assert.ok(store.warning);
  }
  const unreadable = createRuntime({ readFails: true });
  const readStore = new PreferencesStore(unreadable.wx); readStore.load(); readStore.markUsed('squat');
  assert.equal(unreadable.calls.writes, 0);
  const full = createRuntime({ writeFails: true });
  const fullStore = new PreferencesStore(full.wx); fullStore.load();
  assert.equal(fullStore.saveOptical(changeOptical(DEFAULT_OPTICAL, 'darkRatio', 70)), false);
  assert.equal(fullStore.value.optical.darkRatio, 0.7);
  assert.ok(fullStore.warning);
});

test('阈值滑动始终保留迟滞，参数边界与非法输入被限制', () => {
  let settings = { ...DEFAULT_OPTICAL };
  for (const key of ['darkRatio', 'lightRatio', 'minDarkMs', 'minLightMs', 'cooldownMs', 'alpha']) {
    for (const value of [-100, 0, 10, 62, 100, 300, 10000]) {
      settings = changeOptical(settings, key, value);
      assert.ok(isValidOptical(settings), key + ':' + value);
    }
  }
  assert.deepEqual(changeOptical(settings, 'unknown', NaN), settings);
});
