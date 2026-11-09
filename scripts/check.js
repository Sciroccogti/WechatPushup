const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const demo = path.join(root, 'experiments/optical-demo');
let files = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.audit', 'node_modules'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith('.json')) { JSON.parse(fs.readFileSync(file, 'utf8')); files += 1; }
    else if (entry.name.endsWith('.js')) { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }); files += 1; }
  }
}
walk(root);
const app = JSON.parse(fs.readFileSync(path.join(demo, 'app.json'), 'utf8'));
for (const page of app.pages) {
  for (const suffix of ['js', 'json', 'wxml', 'wxss']) {
    if (!fs.existsSync(path.join(demo, page + '.' + suffix))) throw new Error('Missing page file: ' + page + '.' + suffix);
  }
}
const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
if (path.resolve(root, config.miniprogramRoot) !== demo) throw new Error('Incorrect miniprogramRoot');
const wxml = fs.readFileSync(path.join(demo, 'pages/index/index.wxml'), 'utf8');
if (!wxml.includes('frame-size="small"') || !wxml.includes('device-position="front"') || !wxml.includes('wx:if="{{cameraMounted}}"')) throw new Error('Camera safety attributes missing');
const handlers = [...wxml.matchAll(/(?:bind[a-z]+|catch[a-z]+)="([A-Za-z_]\w*)"/g)].map((match) => match[1]);
const js = fs.readFileSync(path.join(demo, 'pages/index/index.js'), 'utf8');
for (const handler of handlers) {
  if (!new RegExp('\\b' + handler + '\\s*\\(').test(js)) throw new Error('Missing WXML handler: ' + handler);
}
function auditRuntime(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) auditRuntime(file);
    else if (entry.name.endsWith('.js')) {
      const source = fs.readFileSync(file, 'utf8');
      if (/\bwx\.(request|uploadFile|connectSocket|setStorageSync|setStorage|createCamera|startLightSensor|onLightSensorChange)\s*\(/.test(source) || /\.(takePhoto|startRecord)\s*\(/.test(source)) throw new Error('Unexpected network/storage/capture API: ' + file);
    }
  }
}
auditRuntime(demo);
console.log('静态检查通过：' + files + ' 个 JS/JSON，页面文件、事件绑定与实验范围检查通过。');
console.log('此命令不编译 WXML/WXSS；微信开发者工具编译与 Android/iOS 摄像头仍待验证。');
