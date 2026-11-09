const { EXERCISES } = require('../miniprogram/config/exercises');
const { assess, generatePlan, adjustProgress } = require('../miniprogram/domain/training/plan');
const days = Number(process.argv[2] || 180);
if (!Number.isInteger(days) || days < 7 || days > 730) throw new Error('Days must be an integer between 7 and 730.');
const exercise = EXERCISES[0];
let profile = assess(exercise, 20, 0);
const rows = [];
for (let day = 0; day < days; day += 3) {
  const at = day * 86400000;
  const plan = generatePlan(exercise, profile, at);
  // 假设每三天训练一次、完全完成、疲劳为2；不是实际能力增长预测。
  const result = {
    id: 'simulation-' + day, purpose: 'plan', startedAt: at, endedAt: at + 600000,
    activeMs: 300000, fatigue: 2, deload: plan.deload,
    groups: plan.groups.map((group) => ({ target: group.target, actual: group.target, status: 'completed' }))
  };
  const next = adjustProgress(profile, result);
  rows.push({ day: day + 1, targets: plan.groups.map((group) => group.target).join('/'), total: plan.total,
    deload: plan.deload, reassessDue: plan.reassessDue, nextLevel: Number(next.level.toFixed(3)), reason: next.reason });
  profile = next;
}
console.table(rows);
console.log('仅为软件策略模拟：能力固定20次、每3天完全完成、疲劳2；未模拟真实人体适应或传感器。');
