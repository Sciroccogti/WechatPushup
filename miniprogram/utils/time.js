function durationLabel(milliseconds) {
  const total = Math.floor(Math.max(0, milliseconds || 0) / 1000);
  if (total < 60) return total + '秒';
  if (total < 3600) return Math.floor(total / 60) + '分' + total % 60 + '秒';
  return Math.floor(total / 3600) + '小时' + Math.floor(total % 3600 / 60) + '分';
}
function dateLabel(at) {
  const date = new Date(at);
  return (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + date.getHours() + ':' + (date.getMinutes() < 10 ? '0' : '') + date.getMinutes();
}
module.exports = { durationLabel, dateLabel };
