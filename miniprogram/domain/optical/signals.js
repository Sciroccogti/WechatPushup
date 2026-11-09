function buildSignal(kind, intervalMs) {
  const signal = [];
  let at = 0;
  const step = intervalMs || 100;
  function hold(value, duration) {
    for (let elapsed = 0; elapsed < duration; elapsed += step) {
      signal.push({ at, value: typeof value === 'function' ? value(signal.length) : value });
      at += step;
    }
  }
  if (kind === 'dark') hold(5, 4000);
  else if (kind === 'unstable') hold((i) => i % 2 ? 70 : 190, 4000);
  else {
    hold(160, 3500);
    if (kind === 'held') hold(25, 7500);
    else if (kind === 'jitter') {
      for (let i = 0; i < 30; i += 1) { hold(55, 100); hold(160, 200); }
    } else {
      for (let i = 0; i < 3; i += 1) { hold(30, 900); hold(160, 1400); }
    }
  }
  return signal;
}

module.exports = { buildSignal };
