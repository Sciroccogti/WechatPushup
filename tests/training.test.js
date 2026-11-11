const test = require('node:test');
const assert = require('node:assert/strict');
const { assess, generatePlan, adjustProgress } = require('../miniprogram/domain/training/plan');
const { TrainingSession } = require('../miniprogram/domain/training/session');
const { EXERCISES } = require('../miniprogram/config/exercises');
const { POLICY } = require('../miniprogram/config/training-policy');
const { TrainingStore, TRAINING_KEY } = require('../miniprogram/services/training-store');
const { PREFERENCES_KEY } = require('../miniprogram/services/preferences');
const { createRuntime } = require('./helpers/runtime');
const day = 86400000;
function outcome(profile, at, overrides = {}) {
  return { id: String(at), exerciseId: profile.exerciseId, purpose: 'plan', startedAt: at, endedAt: at + 600000,
    activeMs: 300000, fatigue: 2, actual: 25, planned: 25, completion: 1, modes: ['touch'], groups: Array.from({ length: 5 }, () => ({ target: 5, actual: 5, status: 'completed', workMs: 60000, restMs: 60000 })), ...overrides };
}

test('各项目从能力生成五组/休息、目标单位不混淆，参数和边界校验', () => {
  for (const exercise of EXERCISES) {
    for (const maximum of [1, 2, 10, 50, 100]) {
      const profile = assess(exercise, maximum, 0);
      const plan = generatePlan(exercise, profile, 0);
      assert.equal(plan.groups.length, 5); assert.equal(plan.recovery, false);
      assert.ok(plan.groups.every((group) => Number.isInteger(group.target) && group.target >= 1 && group.target <= maximum));
      assert.equal(plan.groups.at(-1).restSeconds, 0);
      assert.ok(plan.groups.slice(0, 4).every((group) => group.restSeconds > 0));
    }
    assert.throws(() => assess(exercise, 0, 0), /INVALID_ASSESSMENT/);
    assert.equal(generatePlan(exercise, null, 0).needsAssessment, true);
  }
  assert.notDeepEqual(generatePlan(EXERCISES[0], assess(EXERCISES[0], 10, 0), 0).groups,
    generatePlan(EXERCISES[0], assess(EXERCISES[0], 20, 0), 0).groups);
});

test('维持、小幅递增、疲劳减量、未完成减量与恢复间隔有解释', () => {
  let profile = assess(EXERCISES[0], 20, 0);
  const first = adjustProgress(profile, outcome(profile, 0));
  assert.equal(first.level, 1); assert.equal(generatePlan(EXERCISES[0], first, day).recovery, true);
  profile = first;
  for (let i = 1; i < 3; i += 1) profile = adjustProgress(profile, outcome(profile, i * 3 * day));
  assert.equal(profile.level, 1.05);
  const fourth = adjustProgress(profile, outcome(profile, 9 * day)); assert.equal(fourth.level, profile.level);
  const tired = adjustProgress(profile, outcome(profile, 12 * day, { fatigue: 5 }));
  assert.ok(tired.level < profile.level); assert.equal(tired.nextTrainAt - tired.lastTrainAt, POLICY.highFatigueRecoveryMs);
  const low = adjustProgress(profile, outcome(profile, 12 * day, { groups: Array.from({ length: 5 }, () => ({ target: 5, actual: 1, status: 'skipped' })) }));
  assert.ok(low.level < profile.level); assert.equal(low.completedSessions, profile.completedSessions);
  const tooSoon = adjustProgress(first, outcome(first, day)); assert.match(tooSoon.reason, /恢复间隔/);
  const noWork = adjustProgress(profile, outcome(profile, 12 * day, { activeMs: 0, groups: Array.from({ length: 5 }, () => ({ target: 5, actual: 0, status: 'skipped' })) }));
  assert.equal(noWork.completedSessions, profile.completedSessions); assert.equal(noWork.level, profile.level);
});

test('周期减量/复测提示/久未训练回归；半年模拟有增长、有维持、有恢复日', () => {
  const exercise = EXERCISES[0]; let profile = assess(exercise, 20, 0); let deloads = 0; let increases = 0; let maintains = 0;
  for (let i = 0; i < 60; i += 1) {
    const at = i * 3 * day; const plan = generatePlan(exercise, profile, at);
    assert.equal(plan.recovery, false);
    if (plan.deload) deloads += 1;
    const next = adjustProgress(profile, outcome(profile, at, { deload: plan.deload }));
    if (next.level > profile.level) increases += 1; else maintains += 1;
    assert.ok(next.level <= POLICY.maxLevel); assert.ok(generatePlan(exercise, next, at + day).recovery);
    profile = next;
  }
  assert.ok(deloads >= 7 && increases > 0 && maintains > increases);
  assert.ok(generatePlan(exercise, profile, 180 * day).reassessDue);
  assert.ok(generatePlan(exercise, profile, 210 * day).returning);
  const retest = assess(exercise, 25, 210 * day, profile);
  assert.equal(retest.sinceAssessment, 0); assert.equal(retest.level, 1); assert.equal(retest.completedSessions, profile.completedSessions);
});

test('五组计次自动休息→准备→下一组；暂停/延长/跳过/目标调整不丢进度', () => {
  const session = new TrainingSession({ id: 'test', exercise: EXERCISES[0], purpose: 'plan', plan: { groups: Array.from({ length: 5 }, () => ({ target: 2, restSeconds: 1 })) }, at: 0 });
  session.start(0, 'touch'); session.add(100); session.add(200);
  assert.equal(session.state, 'rest'); session.extendRest(400, 1); session.pause(500);
  assert.equal(session.remainingRest, 1700); session.resumeRest(5000); session.tick(6700);
  assert.equal(session.state, 'ready'); session.tick(7000);
  assert.equal(session.groups[0].restMs, 2300); // 500→5000暂停排除，准备等待计入实际休息。
  session.start(7000, 'touch'); assert.equal(session.index, 1);
  assert.equal(session.setTarget(3, 7100), true); session.add(7200); session.finishSet(7300, true);
  assert.equal(session.groups[1].status, 'skipped');
  for (let group = 2; group < 5; group += 1) {
    session.endRest(8000 + group * 1000); session.start(8000 + group * 1000, 'manual');
    session.add(8100 + group * 1000); session.add(8200 + group * 1000);
  }
  assert.equal(session.state, 'finished'); const result = session.result(3);
  assert.equal(result.groups.length, 5); assert.equal(result.groups[1].actual, 1); assert.equal(result.actual, 9);
});

test('计时使用时间戳，目标到时自动结束，暂停/后台长间隔不算训练', () => {
  const session = new TrainingSession({ id: 'timer', exercise: EXERCISES[3], purpose: 'free', at: 0 });
  session.start(1000, 'timer'); session.tick(2500); session.pause(3000); session.tick(100000);
  assert.equal(session.activeMs, 2000); session.start(100000, 'timer'); session.finish(101500, false);
  assert.equal(session.activeMs, 3500); assert.equal(session.result(2).actual, 3);
  const planned = new TrainingSession({ id: 'timer-plan', exercise: EXERCISES[3], purpose: 'plan', plan: { groups: [{ target: 2, restSeconds: 0 }] }, at: 0 });
  planned.start(0, 'timer'); planned.tick(20000);
  assert.equal(planned.activeMs, 2000); assert.equal(planned.endedAt, 2000); assert.equal(planned.state, 'finished');
});

test('累计时长排序迁移v1，活动时间保存可重试且不重复，打开页面不加时长', () => {
  const h = createRuntime(); const training = h.openPage('training', { exerciseId: 'squat' });
  h.advance(10000); assert.equal(h.storage.get(PREFERENCES_KEY).usageMs.squat || 0, 0);
  training.startCounting(); h.advance(2500); training.pauseCounting();
  assert.equal(h.storage.get(PREFERENCES_KEY).usageMs.squat, 2500);
  h.advance(10000); training.startCounting(); h.advance(1000); training.pauseCounting(); training.pauseCounting();
  assert.equal(h.storage.get(PREFERENCES_KEY).usageMs.squat, 3500);
  training.onUnload();
  const selection = h.openPage('home'); assert.equal(selection.data.exercises[0].id, 'squat');
  selection.onSortChange({ detail: { value: 1 } }); assert.equal(selection.data.sortIndex, 1);
});

test('训练存储独立项目与幂等保存、未来版本不覆盖、保留评估后恢复日', () => {
  const h = createRuntime(); const store = new TrainingStore(h.wx);
  store.saveAssessment('push-up', 20, 0); store.saveAssessment('squat', 30, 0);
  const result = outcome(store.profile('push-up'), 0);
  store.finish(result); store.finish(result);
  assert.equal(store.profile('push-up').completedSessions, 1); assert.equal(store.profile('squat').completedSessions, 0);
  const assessment = { ...result, id: 'assess', exerciseId: 'squat', purpose: 'assessment', actual: 32, planned: 0, completion: null, groups: [{ target: null, actual: 32, status: 'pending', workMs: 300000, restMs: 0 }] };
  store.finish(assessment); assert.equal(store.profile('squat').maximum, 32); assert.equal(store.plan('squat', day).recovery, true);
  const bad = createRuntime({ storage: new Map([[TRAINING_KEY, { schemaVersion: 99 }]]) }); const locked = new TrainingStore(bad.wx);
  assert.equal(locked.saveAssessment('push-up', 10, 0), false); assert.equal(bad.calls.writes, 0); assert.equal(bad.storage.get(TRAINING_KEY).schemaVersion, 99);
});

test('页面完整评估→五组训练→休息→总结，保存一次只推进一次', () => {
  const h = createRuntime(); const assessment = h.openPage('assessment', { exerciseId: 'push-up' });
  assessment.onValueInput({ detail: { value: '10' } }); assessment.saveAssessment();
  let plan = h.followRedirect(assessment); assert.equal(plan.data.plan.groups.length, 5); assert.equal(plan.data.plan.recovery, false);
  const training = h.openPage('training', { exerciseId: 'push-up', purpose: 'plan' }); let page = training;
  for (let group = 0; group < 5; group += 1) {
    if (group === 0) page.startCounting();
    const target = page.data.target;
    for (let n = 0; n < target; n += 1) { h.advance(1000); page.manualAdd(); }
    assert.equal(page._session.groups[group].status, 'completed');
    if (group < 4) {
      const rest = h.followRedirect(page); assert.equal(rest.data.phase, 'rest');
      const before = rest._session.activeMs; h.advance(10000); assert.equal(rest._session.activeMs, before);
      rest.endRest(); rest.nextGroup(); page = h.followRedirect(rest);
      assert.equal(page.data.phase, 'running'); assert.equal(page.data.groupNumber, group + 2);
    } else {
      const summary = h.followRedirect(page); assert.equal(summary.data.result.groups.length, 5);
      summary.saveResult(); summary.saveResult(); assert.equal(summary.data.saved, true);
      const store = new TrainingStore(h.wx); assert.equal(store.profile('push-up').completedSessions, 1); assert.ok(store.plan('push-up', h.now()).recovery);
    }
  }
  assert.equal(h.timers.size, 0);
});

test('完整平板支撑五组计时仅累计训练秒数，长休息/暂停不计时长', () => {
  const h = createRuntime(); const store = new TrainingStore(h.wx); store.saveAssessment('plank', 10, h.now());
  let page = h.openPage('training', { exerciseId: 'plank', purpose: 'plan' });
  const totalSeconds = page._session.groups.reduce((sum, group) => sum + group.target, 0);
  for (let group = 0; group < 5; group += 1) {
    if (group === 0) page.startCounting();
    h.advance(page.data.target * 1000);
    if (group < 4) {
      const rest = h.followRedirect(page); h.advance(1000); rest.pauseCounting();
      const before = rest._session.activeMs; h.advance(90000); assert.equal(rest._session.activeMs, before);
      rest.resumeRest(); rest.endRest(); rest.nextGroup(); page = h.followRedirect(rest);
    } else {
      const summary = h.followRedirect(page); assert.equal(summary.data.result.actual, totalSeconds);
      summary.onHide(); assert.equal(summary.data.saved, true); summary.onUnload();
    }
  }
  assert.equal(h.storage.get(PREFERENCES_KEY).usageMs.plank, totalSeconds * 1000);
  assert.equal(h.calls.camera, 0); assert.equal(h.calls.gyroStart, 0); assert.equal(h.timers.size, 0);
});

test('传感器校准时间不计入累计时长，结束保存/总结离开不会重复累计', () => {
  const h = createRuntime(); const training = h.openPage('training', { exerciseId: 'push-up' });
  training.startOptical(); training.onCameraReady(); h.hold(160, 3500);
  assert.equal(training.data.phase, 'running');
  assert.ok(training._session.activeMs < 1000);
  h.hold(160, 1000); training.endCounting();
  const actualMs = training._session.activeMs; assert.ok(actualMs < 2000);
  const summary = h.followRedirect(training); summary.onHide(); summary.onUnload();
  assert.equal(h.storage.get(PREFERENCES_KEY).usageMs['push-up'], actualMs);
  assert.equal(h.timers.size, 0);
});

test('累计时长与最近排序独立，旧偏好迁移后不丢光学参数，未知数据不覆盖', () => {
  const { PreferencesStore } = require('../miniprogram/services/preferences');
  const { DEFAULT_OPTICAL } = require('../miniprogram/config/optical');
  const h = createRuntime({ storage: new Map([[PREFERENCES_KEY, { schemaVersion: 1, optical: { ...DEFAULT_OPTICAL, darkRatio: 0.7 }, recentExerciseIds: ['plank'] }]]) });
  const store = new PreferencesStore(h.wx); const migrated = store.load();
  assert.equal(migrated.schemaVersion, 4); assert.equal(migrated.optical.darkRatio, 0.7); assert.equal(migrated.sortMode, 'duration');
  store.addUsage('squat', 60000); store.markUsed('plank');
  const selection = h.openPage('home'); assert.equal(selection.data.exercises[0].id, 'squat');
  selection.onSortChange({ detail: { value: 1 } }); assert.equal(selection.data.exercises[0].id, 'plank');
  assert.equal(h.storage.get(PREFERENCES_KEY).optical.darkRatio, 0.7);
});

test('能力测试意外返回不改最大值；损坏结果与存储写入失败可检测', () => {
  const h = createRuntime(); const store = new TrainingStore(h.wx); store.saveAssessment('push-up', 10, 0);
  const training = h.openPage('training', { exerciseId: 'push-up', purpose: 'assessment' });
  training.startCounting(); training.manualAdd(); training.onUnload();
  assert.equal(store.profile('push-up').maximum, 10);
  assert.throws(() => store.finish({ ...outcome(store.profile('push-up'), 0), actual: 999 }), /INVALID_RESULT/);
  const damaged = createRuntime({ storage: new Map([[TRAINING_KEY, { schemaVersion: 1, profiles: true, results: {}, savedOrder: [] }]]) });
  const locked = new TrainingStore(damaged.wx); assert.equal(locked.saveAssessment('squat', 20, 0), false); assert.equal(damaged.calls.writes, 0);
  const full = createRuntime({ writeFails: true }); const failed = new TrainingStore(full.wx);
  assert.equal(failed.saveAssessment('push-up', 10, 0), false); assert.ok(failed.warning);
});

test('累计超过48次训练仍保留旧结果，不按数量自动删除，旧ID重试保持幂等', () => {
  const h = createRuntime(); const store = new TrainingStore(h.wx); store.saveAssessment('push-up', 20, 0);
  const first = outcome(store.profile('push-up'), 0);
  for (let index = 0; index < 55; index += 1) store.finish(outcome(store.profile('push-up'), index * 3 * day));
  assert.ok(store.result(first.id)); assert.equal(store.profile('push-up').completedSessions, 55);
  store.finish(first); assert.equal(store.profile('push-up').completedSessions, 55);
  assert.equal(h.storage.get(TRAINING_KEY).savedOrder.length, 55);
});
