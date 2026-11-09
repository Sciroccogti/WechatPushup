function atLeast(version, minimum) {
  const a = String(version || '').split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (!Number.isFinite(a[i])) return false;
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

function inspectCapabilities(api) {
  let info = {};
  try {
    info = typeof api.getDeviceInfo === 'function' ? api.getDeviceInfo() : api.getSystemInfoSync();
    if (typeof api.getAppBaseInfo === 'function') info = Object.assign({}, info, api.getAppBaseInfo());
  } catch (_) { /* 检测失败时保守降级 */ }
  const device = [info.model || '未知机型', info.system || '', info.platform || 'unknown'].join(' / ');
  const base = info.SDKVersion || '未知';
  const reason = !['android', 'ios'].includes(info.platform) ? '光学模式请使用 Android 或 iPhone 真机；开发者工具可测试模拟信号与触屏。' :
    !atLeast(base, '2.32.3') ? '光学模式要求基础库 ≥ 2.32.3，以完整处理隐私授权；取帧 API 本身最低为 2.7.0。' :
    typeof api.createCameraContext !== 'function' || typeof api.authorize !== 'function' ||
    typeof api.requirePrivacyAuthorize !== 'function' || typeof api.onNeedPrivacyAuthorization !== 'function' ||
    typeof api.canIUse !== 'function' ||
    !api.canIUse('camera.frame-size') || !api.canIUse('CameraContext.onCameraFrame') ||
    !api.canIUse('CameraFrameListener.start') ? '当前环境未提供完整的公开摄像头取帧能力，请使用触屏。' : '';
  return { device, base, version: info.version || '未知', canCamera: !reason, reason };
}

module.exports = { inspectCapabilities, atLeast };
