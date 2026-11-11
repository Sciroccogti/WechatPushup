const test = require('node:test');
const assert = require('node:assert/strict');
const { createRuntime } = require('./helpers/runtime');
const { result, document } = require('./helpers/record-fixtures');
const { TrainingStore, TRAINING_KEY } = require('../miniprogram/services/training-store');
const { CHUNK_PREFIX, JOURNAL_KEY, LEGACY_BACKUP_KEY } = require('../miniprogram/services/storage/record-document');
const { history, statistics } = require('../miniprogram/domain/records/query');
const { normalizeDocument } = require('../miniprogram/domain/records/document');
const { dayKey, periodRange, shiftDay } = require('../miniprogram/domain/records/dates');
const { encodeBackup } = require('../miniprogram/domain/records/backup');
const { PREFERENCES_KEY } = require('../miniprogram/services/preferences');
const at = new Date('2026-11-12T20:00:00').getTime();

test('历史记录按日期/运动筛选和分页，单次/单组与时间单位不混淆', () => {
  const records = Array.from({ length: 25 }, (_, i) => result('r-' + i, i < 10 ? '2026-11-11' : '2026-11-12'));
  records.push(result('plank', '2026-11-12', { exerciseId: 'plank', groups: [{ target: null, actual: 60, workMs: 60000, restMs: 5000, status: 'completed' }], actual: 60, modes: ['timer'] }));
  const doc = document(records), first = history(doc, {}, 20);
  assert.equal(first.total, 26); assert.equal(first.hasMore, true); assert.equal(first.groups.reduce((s, d) => s + d.records.length, 0), 20);
  const filtered = history(doc, { exerciseId: 'plank', start: '2026-11-12', end: '2026-11-12' });
  assert.equal(filtered.total, 1); const row = filtered.groups[0].records[0]; assert.equal(row.unit, '秒'); assert.equal(row.actual, 60); assert.equal(row.rest, '5秒'); assert.match(row.url, /record-detail/);
  assert.equal(history(doc, { end: '2026-11-10' }).total, 0);
});

test('周月范围、跨年/闰日、本地日期、连续天数及最好成绩按单运动统计', () => {
  assert.deepEqual(periodRange('week', at), { start: '2026-11-09', end: '2026-11-15' });
  assert.equal(shiftDay('2024-03-01', -1), '2024-02-29'); assert.equal(shiftDay('2027-01-01', -1), '2026-12-31');
  const records = ['2026-10-31', '2026-11-01', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'].map((d, i) => result('r-' + i, d));
  records.push(result('plank', '2026-11-12', { exerciseId: 'plank' }));
  records.push(result('same-day', '2026-11-12')); const doc = document(records);
  const stats = statistics(doc, 'push-up', 'month', at);
  assert.equal(stats.sessions, 6); assert.equal(stats.volume, 60); assert.equal(stats.weekVolume, 50); assert.equal(stats.monthVolume, 60);
  assert.equal(stats.days, 5); assert.equal(stats.currentStreak, 4); assert.equal(stats.longestStreak, 4); assert.equal(stats.bestSession, 10); assert.equal(stats.bestSet, 10);
  assert.equal(stats.daily.at(-1).value, 20); assert.equal(stats.daily.at(-1).height, 100); assert.equal(stats.elapsed, '6分0秒');
  assert.equal(statistics(doc, 'push-up', 'all', new Date('2026-11-13T12:00:00').getTime()).currentStreak, 4);
  assert.equal(statistics(doc, 'push-up', 'all', new Date('2026-11-14T12:00:00').getTime()).currentStreak, 0);
  assert.equal(statistics(doc, 'plank', 'all', at).volume, 10);
});

test('五组完成率按目标加权并封顶，跳过/提前结束不算完成；能力评估与训练量分开', () => {
  const plan = (id, actual, aborted) => result(id, '2026-11-12', { purpose: 'plan', groups: Array.from({ length: 5 }, () => ({ target: 10, actual, workMs: 1000, restMs: 1000, status: aborted ? 'skipped' : 'completed' })), actual: actual * 5, planned: 50, completion: actual / 10, aborted });
  const doc = document([plan('full', 12, false), plan('skip', 4, true), result('assess', '2026-11-11', { purpose: 'assessment', actual: 20, groups: [{ target: null, actual: 20, workMs: 60000, restMs: 0, status: 'completed' }] })]);
  doc.assessments.manual = { exerciseId: 'push-up', at: at - 3 * 86400000, localDate: '2026-11-09', maximum: 15, source: 'manual' };
  const s = statistics(doc, 'push-up', 'all', at);
  assert.equal(s.planCompletion, '70%'); assert.equal(s.completedPlans, 1); assert.equal(s.planSessions, 2);
  assert.equal(s.events.length, 2); assert.equal(s.ability, 20); assert.equal(s.bestSet, 20); assert.equal(s.bestSession, 60);
});

test('旧单文档只读载入，首次保存备份原文档并迁移为分块；旧结果/资料和最近能力保留', () => {
  const h = createRuntime(); const seed = new TrainingStore(h.wx); seed.saveAssessment('squat', 20, at);
  const snapshot = seed.snapshot(), first = result('old', '2026-11-11');
  const old = { schemaVersion: 1, profiles: snapshot.profiles, results: { old: { ...first, revision: undefined, localDate: undefined, updatedAt: undefined } }, savedOrder: ['old'] };
  const storage = new Map([[TRAINING_KEY, structuredClone(old)]]), r = createRuntime({ storage }); const store = new TrainingStore(r.wx);
  assert.equal(store.snapshot().results.old.localDate, '2026-11-11'); assert.equal(r.calls.writes, 0); assert.equal(store.profile('squat').maximum, 20);
  assert.equal(store.finish(result('new')), true); assert.equal(storage.get(TRAINING_KEY).schemaVersion, 2); assert.deepEqual(storage.get(LEGACY_BACKUP_KEY), JSON.parse(JSON.stringify(old)));
  const reload = new TrainingStore(r.wx).snapshot(); assert.equal(reload.savedOrder.length, 2); assert.equal(Object.values(reload.assessments)[0].source, 'legacy');
  assert.equal(storage.get(TRAINING_KEY).results, undefined); assert.ok(storage.get(TRAINING_KEY).chunks.length);
});

test('超过两块的记录完整保存；追加只写尾块，重复ID不会写盘或重复推进计划', () => {
  const h = createRuntime(); const store = new TrainingStore(h.wx); for (let i = 0; i < 45; i++) assert.equal(store.finish(result('many-' + i)), true);
  const index = structuredClone(h.storage.get(TRAINING_KEY)); assert.equal(index.chunks.length, 3); assert.ok(index.chunks.every((c) => c.ids.length <= 20));
  assert.equal(store.finish(result('another')), true); const changed = h.storage.get(TRAINING_KEY); assert.equal(changed.chunks[0].key, index.chunks[0].key); assert.equal(changed.chunks[1].key, index.chunks[1].key);
  const writes = h.calls.writes; store.finish(result('another')); assert.equal(h.calls.writes, writes);
  assert.equal(new TrainingStore(h.wx).snapshot().savedOrder.length, 46); assert.equal([...h.storage.keys()].filter((k) => k.startsWith(CHUNK_PREFIX)).length, 3);
});

test('分块写入/索引提交任一步失败旧记录和资料不丢，重试和重启可恢复且无孤立块', () => {
  for (const failAt of [1, 2, 3]) {
    const h = createRuntime(); const store = new TrainingStore(h.wx); store.finish(result('before')); const before = store.exportBackup(at);
    const original = h.wx.setStorageSync; let writes = 0;
    h.wx.setStorageSync = (key, value) => { if (++writes === failAt) throw new Error('full'); original(key, value); };
    assert.equal(store.finish(result('after')), false); assert.match(store.warning, /保存失败/);
    h.wx.setStorageSync = original; const reload = new TrainingStore(h.wx); assert.equal(reload.exportBackup(at), before);
    assert.equal(reload.result('after'), null); assert.equal(reload.finish(result('after')), true); assert.equal(reload.snapshot().savedOrder.length, 2);
    assert.equal([...h.storage.keys()].filter((k) => k.startsWith(CHUNK_PREFIX)).length, 1); assert.equal(h.storage.has(JOURNAL_KEY), false);
  }
});

test('模拟进程在索引提交前/后中断，日志恢复只清理非引用块', () => {
  const h = createRuntime(); const store = new TrainingStore(h.wx); store.finish(result('before'));
  const index = structuredClone(h.storage.get(TRAINING_KEY)), oldKey = index.chunks[0].key, orphan = CHUNK_PREFIX + 'orphan';
  h.storage.set(orphan, { schemaVersion: 1, results: { after: result('after') } }); h.storage.set(JOURNAL_KEY, { schemaVersion: 1, keys: [oldKey, orphan] });
  const reload = new TrainingStore(h.wx); assert.ok(reload.result('before')); assert.equal(h.storage.has(orphan), false); assert.equal(h.storage.has(oldKey), true);
  const finalKey = CHUNK_PREFIX + 'final'; h.storage.set(finalKey, { schemaVersion: 1, results: { after: result('after') } });
  h.storage.set(TRAINING_KEY, { ...index, savedOrder: ['after'], chunks: [{ key: finalKey, ids: ['after'] }] }); h.storage.set(JOURNAL_KEY, { schemaVersion: 1, keys: [oldKey, finalKey] });
  assert.ok(new TrainingStore(h.wx).result('after')); assert.equal(h.storage.has(oldKey), false); assert.equal(h.storage.has(finalKey), true);
});

test('损坏根/未来版本/缺失块/读取失败均保留原数据并锁定写入与导入', () => {
  const h = createRuntime(); new TrainingStore(h.wx).finish(result('valid')); const valid = structuredClone(h.storage.get(TRAINING_KEY));
  const backup = encodeBackup(document([result('import')]), at);
  for (const invalid of [null, 0, false, { schemaVersion: 99 }, valid]) {
    const r = createRuntime({ storage: new Map([[TRAINING_KEY, invalid]]) }); const store = new TrainingStore(r.wx);
    assert.equal(store.locked, true); assert.equal(store.finish(result('new')), false); assert.equal(store.importBackup(backup).saved, false);
    assert.equal(r.calls.writes, 0); assert.deepEqual(r.storage.get(TRAINING_KEY), invalid); assert.throws(() => store.exportBackup(at));
  }
  const read = new TrainingStore(createRuntime({ readFails: true }).wx); assert.equal(read.locked, true);
});

test('删除仅经确认写入墓碑，不更改计划；旧备份/保存重试不复活，统计同步移除', () => {
  const h = createRuntime(); const store = new TrainingStore(h.wx); store.saveAssessment('push-up', 20, at); store.finish(result('one'));
  const backup = store.exportBackup(at), profile = store.profile('push-up'); const detail = h.openPage('record-detail', { id: 'one' });
  detail.confirmDelete(); assert.ok(store.result('one')); detail.askDelete(); detail.cancelDelete(); assert.ok(store.result('one'));
  detail.askDelete(); detail.confirmDelete(); assert.equal(detail.data.removed, true); assert.equal(store.result('one'), null);
  assert.deepEqual(store.profile('push-up'), profile); assert.equal(store.snapshot().tombstones.one.revision, 2);
  assert.equal(store.previewImport(backup).blockedByDeletion, 1); store.importBackup(backup); store.finish(result('one')); assert.equal(store.result('one'), null);
  assert.equal(statistics(store.snapshot(), 'push-up', 'all', at).volume, 0);
});

test('导出→新设备预览/导入→重启一致，重复导入幂等，冲突不覆盖或推进本机计划', () => {
  const h = createRuntime(); const source = new TrainingStore(h.wx); source.saveAssessment('push-up', 20, at); source.finish(result('one'));
  const backup = source.exportBackup(at), r = createRuntime(), target = new TrainingStore(r.wx);
  assert.equal(target.previewImport(backup).added, 1); assert.equal(r.calls.writes, 0);
  assert.equal(target.importBackup(backup).saved, true); assert.deepEqual(new TrainingStore(r.wx).snapshot(), source.snapshot());
  const writes = r.calls.writes; assert.equal(target.importBackup(backup).report.duplicates, 1); assert.equal(r.calls.writes, writes);
  const doc = document([result('one', '2026-11-12', { fatigue: 5 }), result('two')]);
  const report = target.importBackup(encodeBackup(doc, at)); assert.equal(report.report.conflicts, 1); assert.equal(report.report.added, 1); assert.equal(target.result('one').fatigue, 3);
  assert.equal(target.profile('push-up').maximum, 20);
});

test('无效导入/恶意ID不写入，原始未知字段被剔除，导入失败不部分合并', () => {
  const h = createRuntime(), store = new TrainingStore(h.wx); store.finish(result('existing')); const before = store.exportBackup(at);
  for (const text of ['{', '{}', JSON.stringify({ format: 'fitness-coach-backup', schemaVersion: 99 }), encodeBackup(document([result('good')]), at).replace('"actual": 10', '"actual": -1')]) assert.throws(() => store.importBackup(text));
  assert.equal(store.exportBackup(at), before); assert.equal(store.result('__proto__'), null); assert.equal(store.result('constructor'), null);
  assert.throws(() => normalizeDocument({ ...document([result('safe')]), results: { safe: { ...result('safe'), id: 'constructor' } } }));
  const doc = document([result('clean')]); doc.results.clean.rawFrame = [1, 2]; assert.equal(normalizeDocument(doc).results.clean.rawFrame, undefined);
  const original = h.wx.setStorageSync; h.wx.setStorageSync = () => { throw new Error('full'); };
  assert.equal(store.importBackup(encodeBackup(document([result('new')]), at)).saved, false); h.wx.setStorageSync = original;
  assert.equal(store.exportBackup(at), before);
});

test('记录页自动刷新、分页/日期校验、导入确认和导出；统计页不同单位及空数据不启动硬件', () => {
  const h = createRuntime(); const store = new TrainingStore(h.wx); for (let i = 0; i < 23; i++) store.finish(result('r-' + i));
  const page = h.openPage('history'); assert.equal(page.data.total, 23); assert.equal(page.data.hasMore, true); page.loadMore(); assert.equal(page.data.hasMore, false);
  page.onDateChange({ currentTarget: { dataset: { key: 'startDate' } }, detail: { value: '2026-11-13' } }); assert.equal(page.data.total, 0);
  page.onDateChange({ currentTarget: { dataset: { key: 'endDate' } }, detail: { value: '2026-11-12' } }); assert.match(page.data.message, /开始日期/); page.resetFilters();
  store.finish(result('later')); page.onShow(); assert.equal(page.data.total, 24); page.openExport(); assert.match(page.data.backupText, /fitness-coach-backup/);
  page.openImport(); page.onImportInput({ detail: { value: encodeBackup(document([result('imported')]), at) } }); page.confirmImport(); assert.equal(store.result('imported'), null);
  page.previewImport(); assert.equal(page.data.importReport.added, 1); page.confirmImport(); assert.equal(page.data.total, 25);
  const stats = h.openPage('statistics'); stats.onPeriodChange({ detail: { value: 2 } }); assert.equal(stats.data.stats.unit, '次'); stats.onExerciseChange({ detail: { value: 3 } }); assert.equal(stats.data.stats.unit, '秒'); assert.equal(stats.data.stats.volume, 0);
  assert.equal(h.calls.camera, 0); assert.equal(h.calls.accelStart, 0); assert.equal(h.calls.gyroStart, 0); assert.equal(h.timers.size, 0);
});

test('完成自由/计时训练保存后在历史详情可见，重启保留每组及模式，筛选不写偏好', () => {
  for (const id of ['push-up', 'plank']) {
    const h = createRuntime(); const p = h.openPage('training', { exerciseId: id }); p.startCounting(); h.advance(2500); if (id === 'push-up') p.manualAdd(); p.endCounting();
    const summary = h.followRedirect(p); summary.saveResult(); assert.equal(summary.data.saved, true); const pref = structuredClone(h.storage.get(PREFERENCES_KEY));
    const record = h.openPage('record-detail', { id: summary.data.result.id }); assert.equal(record.data.record.actual, id === 'plank' ? 2 : 1); assert.equal(record.data.record.groups.length, 1);
    const history = h.openPage('history'); history.onExerciseChange({ detail: { value: 1 } }); assert.deepEqual(h.storage.get(PREFERENCES_KEY), pref);
    const restarted = createRuntime({ storage: h.storage }); const again = restarted.openPage('record-detail', { id: summary.data.result.id }); assert.ok(again.data.record); assert.match(again.data.record.modes, id === 'plank' ? /计时/ : /触屏/);
  }
});

test('迁移写备份或提交失败不改旧根，重试成功且旧备份冲突不被覆盖', () => {
  const r = result('old'); const old = { schemaVersion: 1, profiles: {}, results: { old: r }, savedOrder: ['old'] };
  for (const failAt of [2, 3, 4]) {
    const h = createRuntime({ storage: new Map([[TRAINING_KEY, structuredClone(old)]]) }); const store = new TrainingStore(h.wx), write = h.wx.setStorageSync; let calls = 0;
    h.wx.setStorageSync = (key, value) => { if (++calls === failAt) throw new Error('quota'); write(key, value); };
    assert.equal(store.finish(result('new')), false); assert.deepEqual(h.storage.get(TRAINING_KEY), old);
    h.wx.setStorageSync = write; assert.equal(store.finish(result('new')), true); assert.ok(store.result('old')); assert.deepEqual(h.storage.get(LEGACY_BACKUP_KEY), old);
  }
  const h = createRuntime({ storage: new Map([[TRAINING_KEY, old], [LEGACY_BACKUP_KEY, { important: true }]]) }); const store = new TrainingStore(h.wx);
  assert.equal(store.finish(result('new')), false); assert.deepEqual(h.storage.get(LEGACY_BACKUP_KEY), { important: true }); assert.deepEqual(h.storage.get(TRAINING_KEY), old);
});

test('清理失败不误报已保存失败，重启后恢复清理；损坏事务日志不能删任意键', () => {
  const h = createRuntime(); const store = new TrainingStore(h.wx); store.finish(result('one'));
  h.wx.removeStorageSync = () => { throw new Error('busy'); }; assert.equal(store.finish(result('two')), true); assert.match(store.warning, /已保存/);
  assert.ok(new TrainingStore(h.wx).result('two')); h.wx.removeStorageSync = (key) => h.storage.delete(key);
  const reload = new TrainingStore(h.wx); assert.equal(reload.warning, ''); assert.equal(h.storage.has(JOURNAL_KEY), false);
  h.storage.set('unrelated-key', { keep: 1 }); h.storage.set(JOURNAL_KEY, { schemaVersion: 1, keys: ['unrelated-key'] });
  const bad = new TrainingStore(h.wx); assert.ok(bad.result('one')); assert.equal(bad.finish(result('three')), false); assert.deepEqual(h.storage.get('unrelated-key'), { keep: 1 });
});

test('手动能力事件持续保留，结果按开始时记录日期归档；迁移不把同次测试补成两条评估', () => {
  const h = createRuntime(), store = new TrainingStore(h.wx); store.saveAssessment('push-up', 15, at - 86400000); store.saveAssessment('push-up', 20, at);
  const s = statistics(store.snapshot(), 'push-up', 'all', at); assert.equal(s.events.length, 2); assert.equal(s.ability, 20);
  const r = result('other-zone', '2026-11-12', { localDate: '2026-11-11' }); store.finish(r);
  assert.equal(history(store.snapshot(), { end: '2026-11-11' }).total, 1);
  const assessment = result('test', '2026-11-12', { purpose: 'assessment' }); store.finish(assessment); const snapshot = store.snapshot();
  const migrated = normalizeDocument({ schemaVersion: 1, profiles: snapshot.profiles, results: { test: assessment }, savedOrder: ['test'] });
  assert.equal(Object.keys(migrated.assessments).length, 0); assert.equal(statistics(migrated, 'push-up', 'all', at).events.length, 1);
});

test('有计划资料的重复导入不推进周期；删除失败保留详情，空/损坏列表状态可恢复', () => {
  const h = createRuntime(); const store = new TrainingStore(h.wx); store.saveAssessment('push-up', 20, at);
  const groups = Array.from({ length: 5 }, () => ({ target: 2, actual: 2, workMs: 1000, restMs: 1000, status: 'completed' }));
  store.finish(result('plan', '2026-11-12', { purpose: 'plan', groups, actual: 10, planned: 10, completion: 1 })); const backup = store.exportBackup(at), count = store.profile('push-up').completedSessions;
  store.importBackup(backup); store.importBackup(backup); assert.equal(store.profile('push-up').completedSessions, count);
  const detail = h.openPage('record-detail', { id: 'plan' }), write = h.wx.setStorageSync; h.wx.setStorageSync = () => { throw new Error('full'); };
  detail.askDelete(); detail.confirmDelete(); assert.ok(detail.data.record); assert.match(detail.data.warning, /保存失败/); h.wx.setStorageSync = write; assert.ok(store.result('plan'));
  const empty = createRuntime().openPage('history'); assert.equal(empty.data.total, 0); assert.equal(empty.data.locked, false);
  const bad = createRuntime({ storage: new Map([[TRAINING_KEY, { schemaVersion: 99 }]]) }); const page = bad.openPage('history'); assert.equal(page.data.locked, true); assert.ok(page.data.warning); assert.equal(bad.calls.writes, 0);
});
