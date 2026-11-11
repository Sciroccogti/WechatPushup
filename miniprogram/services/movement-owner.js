// 深蹲陀螺仪与仰卧起坐融合检测共用一个运动检测会话。
let owner = null;
function claim(source) { if (owner && owner !== source) owner.stop(); owner = source; }
function release(source) { if (owner === source) owner = null; }
const owns = (source) => owner === source;
const needs = (sensor) => !!owner && (sensor === 'accelerometer' ? !!owner.accelerometerWanted : !!owner.rotationWanted);
module.exports = { claim, release, owns, needs };
