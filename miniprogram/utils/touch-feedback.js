const PALETTE = Object.freeze(['#d6e8ce', '#cce5d9', '#e0e9c8', '#c8dfc9', '#d8e7bb', '#c8e0d8', '#e4ecd1']);

function nextTouchFeedback(event, previousColor, random = Math.random) {
  const colors = PALETTE.filter((color) => color !== previousColor);
  const value = random();
  const index = Number.isFinite(value) ? Math.max(0, Math.min(colors.length - 1, Math.floor(value * colors.length))) : 0;
  const point = event && ((event.touches && event.touches[0]) || (event.changedTouches && event.changedTouches[0]));
  const x = point && point.clientX;
  const y = point && point.clientY;
  return { color: colors[index], x: Number.isFinite(x) ? Math.max(0, x) + 'px' : '50vw', y: Number.isFinite(y) ? Math.max(0, y) + 'px' : '50vh' };
}

module.exports = { nextTouchFeedback, PALETTE };
