const pad = (n) => String(n).padStart(2, '0');
function dayKey(at) { const d = new Date(at); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T12:00:00'); return Number.isFinite(d.getTime()) && dayKey(d.getTime()) === value;
}
const ordinal = (key) => Date.parse(key + 'T00:00:00Z') / 86400000;
const shiftDay = (key, days) => new Date((ordinal(key) + days) * 86400000).toISOString().slice(0, 10);
function periodRange(period, at) {
  const today = dayKey(at), date = new Date(at);
  if (period === 'week') return { start: shiftDay(today, -((date.getDay() + 6) % 7)), end: shiftDay(today, 6 - ((date.getDay() + 6) % 7)) };
  if (period === 'month') return { start: today.slice(0, 7) + '-01', end: dayKey(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12).getTime()) };
  if (period === '7days') return { start: shiftDay(today, -6), end: today };
  return { start: '', end: '' };
}
function clock(at) { const d = new Date(at); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
module.exports = { dayKey, validDay, ordinal, shiftDay, periodRange, clock };
