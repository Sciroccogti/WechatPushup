const { EXERCISES, getExerciseById } = require('../../config/exercises');
const { dayKey, validDay, ordinal, shiftDay, periodRange, clock } = require('./dates');
const { durationLabel } = require('../../utils/time');
const PURPOSES = { plan: '五组计划', free: '自由训练', assessment: '能力测试' };
const MODES = { touch: '触屏', optical: '光学', gyro: '陀螺仪', motion: '加速度主导 / 旋转辅助', timer: '计时器', manual: '手动调整' };
function filterRecords(document, filters = {}) {
  return document.savedOrder.map((id) => document.results[id]).filter((r) => (!filters.exerciseId || r.exerciseId === filters.exerciseId) &&
    (!filters.start || r.localDate >= filters.start) && (!filters.end || r.localDate <= filters.end)).sort((a, b) => b.localDate.localeCompare(a.localDate) || b.startedAt - a.startedAt || a.id.localeCompare(b.id));
}
function recordView(result) {
  const e = getExerciseById(result.exerciseId);
  return { id: result.id, exerciseId: e.id, name: e.name, unit: e.unit, actual: result.actual, target: result.planned || '—', purpose: PURPOSES[result.purpose],
    date: result.localDate, startTime: clock(result.startedAt), endTime: clock(result.endedAt), endDate: dayKey(result.endedAt),
    elapsed: durationLabel(result.activeMs), rest: durationLabel(result.groups.reduce((sum, g) => sum + g.restMs, 0)),
    completion: result.completion === null ? '—' : Math.round(result.completion * 100) + '%', fatigue: ['轻松', '尚可', '适中', '较累', '很累'][result.fatigue - 1],
    status: result.aborted ? '提前结束' : result.groups.every((g) => g.status === 'completed') ? '已完成' : '已结束',
    modes: result.modes.map((m) => MODES[m]).join('、') || '未记录',
    url: '/pages/record-detail/index?id=' + encodeURIComponent(result.id),
    groups: result.groups.map((g, i) => ({ number: i + 1, target: g.target === null ? '—' : g.target, original: g.plannedTarget === null ? '—' : g.plannedTarget,
      actual: g.actual, elapsed: durationLabel(g.workMs), rest: durationLabel(g.restMs), status: { completed: '完成', skipped: '跳过', pending: '未完成' }[g.status] })) };
}
function history(document, filters, limit = 20) {
  const all = filterRecords(document, filters);
  const groups = [];
  for (const r of all.slice(0, limit)) {
    if (!groups.length || groups[groups.length - 1].date !== r.localDate) groups.push({ date: r.localDate, records: [] });
    groups[groups.length - 1].records.push(recordView(r));
  }
  return { groups, total: all.length, hasMore: all.length > limit };
}
function streaks(records, today) {
  const days = [...new Set(records.filter((r) => r.actual > 0 || r.activeMs > 0).map((r) => r.localDate))].filter((d) => d <= today).sort();
  let longest = 0, run = 0, previous = null;
  for (const d of days) { run = previous && ordinal(d) - ordinal(previous) === 1 ? run + 1 : 1; longest = Math.max(longest, run); previous = d; }
  const set = new Set(days); let cursor = set.has(today) ? today : shiftDay(today, -1), current = 0;
  while (set.has(cursor)) { current++; cursor = shiftDay(cursor, -1); }
  return { current, longest };
}
function statistics(document, exerciseId, period, at) {
  const e = getExerciseById(exerciseId) || EXERCISES[0], today = dayKey(at), range = periodRange(period, at);
  const all = filterRecords(document, { exerciseId: e.id }).filter((r) => r.localDate <= today);
  const rows = all.filter((r) => (!range.start || r.localDate >= range.start) && (!range.end || r.localDate <= range.end));
  const sum = (field) => rows.reduce((n, r) => n + r[field], 0);
  const plans = rows.filter((r) => r.purpose === 'plan');
  const planned = plans.reduce((n, r) => n + r.planned, 0), capped = plans.reduce((n, r) => n + Math.min(r.planned, r.actual), 0);
  const byDay = new Map(); for (const r of rows) byDay.set(r.localDate, (byDay.get(r.localDate) || 0) + r.actual);
  const chartStart = range.start && range.start > shiftDay(today, -13) ? range.start : shiftDay(today, -13);
  const daily = []; for (let d = chartStart; d <= today; d = shiftDay(d, 1)) daily.push({ date: d, label: d.slice(5), value: byDay.get(d) || 0 });
  const max = Math.max(1, ...daily.map((d) => d.value)); for (const d of daily) d.height = d.value ? Math.max(2, Math.round(d.value / max * 100)) : 0;
  const events = Object.entries(document.assessments).filter(([, a]) => a.exerciseId === e.id).map(([id, a]) => ({ id, at: a.at, date: a.localDate, maximum: a.maximum, source: a.source === 'manual' ? '手动评估' : '旧版当前能力' }));
  for (const r of all) if (r.purpose === 'assessment' && !r.aborted) events.push({ id: r.id, at: r.endedAt, date: r.localDate, maximum: r.actual, source: '能力测试' });
  events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const recentEvents = events.slice(-12).reverse();
  const eventMax = Math.max(1, ...recentEvents.map((event) => event.maximum));
  for (const event of recentEvents) event.width = Math.round(event.maximum / eventMax * 100);
  const week = periodRange('week', at), month = periodRange('month', at);
  const volume = (range) => all.filter((r) => r.localDate >= range.start && r.localDate <= today).reduce((n, r) => n + r.actual, 0);
  return { name: e.name, unit: e.unit, sessions: rows.length, volume: sum('actual'), elapsed: durationLabel(sum('activeMs')), days: new Set(rows.map((r) => r.localDate)).size,
    weekVolume: volume(week), monthVolume: volume(month), currentStreak: streaks(all, today).current, longestStreak: streaks(all, today).longest,
    bestSession: Math.max(0, ...all.map((r) => r.actual)), bestSet: Math.max(0, ...all.flatMap((r) => r.groups.map((g) => g.actual))),
    planCompletion: planned ? Math.round(capped / planned * 100) + '%' : '—', completedPlans: plans.filter((r) => !r.aborted && r.groups.every((g) => g.status === 'completed')).length,
    planSessions: plans.length, daily, events: recentEvents, ability: events.length ? events[events.length - 1].maximum : '—', rangeLabel: range.start ? range.start + ' 至 ' + (range.end > today ? today : range.end) : '全部记录' };
}
module.exports = { history, filterRecords, recordView, statistics, validDay };
