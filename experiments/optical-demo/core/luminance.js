// 只在当前回调中读取原始帧；不持有帧、不生成图片、不做姿态识别。
function getLuminance(frame) {
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
      frame.width < 1 || frame.height < 1 || !(frame.data instanceof ArrayBuffer) ||
      frame.data.byteLength !== frame.width * frame.height * 4) {
    throw new Error('INVALID_RGBA_FRAME');
  }
  const pixels = new Uint8Array(frame.data);
  const left = Math.floor(frame.width * 0.15);
  const top = Math.floor(frame.height * 0.15);
  const right = Math.max(left + 1, Math.ceil(frame.width * 0.85));
  const bottom = Math.max(top + 1, Math.ceil(frame.height * 0.85));
  const stepX = Math.max(1, Math.ceil((right - left) / 32));
  const stepY = Math.max(1, Math.ceil((bottom - top) / 32));
  let total = 0;
  let samples = 0;
  for (let y = top; y < bottom; y += stepY) {
    for (let x = left; x < right; x += stepX) {
      const i = (y * frame.width + x) * 4;
      total += (77 * pixels[i] + 150 * pixels[i + 1] + 29 * pixels[i + 2]) / 256;
      samples += 1;
    }
  }
  return { value: total / samples, samples };
}

module.exports = { getLuminance };
