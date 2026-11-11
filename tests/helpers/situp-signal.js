const vector = (degrees, magnitude = 1) => ({ x: 0, y: Math.sin(degrees * Math.PI / 180) * magnitude, z: Math.cos(degrees * Math.PI / 180) * magnitude });
function situpSignal(h) {
  const hold = (angle, ms, rotation = 0, magnitude = 1) => {
    for (let at = 0; at < ms; at += 20) { h.gyro({ x: rotation, y: 0, z: 0 }); h.accel(vector(angle, magnitude)); h.advance(20); }
  };
  const ramp = (from, to, ms, rotation = Math.sign(to - from)) => {
    for (let at = 20; at <= ms; at += 20) hold(from + (to - from) * at / ms, 20, rotation);
  };
  const cycle = () => { ramp(0, 60, 800); hold(60, 300); ramp(60, 0, 800); hold(0, 800); };
  return { hold, ramp, cycle, calibrate: () => hold(0, 1400) };
}
module.exports = { vector, situpSignal };
