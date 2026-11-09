const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const product = path.join(root, 'miniprogram');
const demo = path.join(root, 'experiments/optical-demo');
let files = 0;
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.audit', 'node_modules'].includes(entry.name) || entry.name === 'project.private.config.json') continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, visit);
    else visit(file);
  }
}
walk(root, (file) => {
  if (file.endsWith('.json')) { readJson(file); files += 1; }
  else if (file.endsWith('.js')) { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }); files += 1; }
});

function inside(appRoot, file) {
  const relative = path.relative(appRoot, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path outside app: ' + file);
  return file;
}
function resolveAppPath(appRoot, owner, target) {
  return inside(appRoot, target.startsWith('/') ? path.join(appRoot, target.slice(1)) : path.resolve(path.dirname(owner), target));
}
function checkApp(appRoot, projectFile) {
  const project = readJson(projectFile);
  if (path.resolve(path.dirname(projectFile), project.miniprogramRoot) !== appRoot || project.compileType !== 'miniprogram') throw new Error('Incorrect native project root: ' + projectFile);
  for (const ext of ['js', 'json', 'wxss']) {
    if (!fs.existsSync(path.join(appRoot, 'app.' + ext))) throw new Error('Missing app.' + ext);
  }
  const app = readJson(path.join(appRoot, 'app.json'));
  if (!Array.isArray(app.pages) || app.pages.length === 0 || new Set(app.pages).size !== app.pages.length) throw new Error('Invalid pages: ' + appRoot);
  const tabs = new Set((app.tabBar ? app.tabBar.list : []).map((item) => item.pagePath));
  for (const tab of tabs) if (!app.pages.includes(tab)) throw new Error('Tab not registered: ' + tab);
  const checked = new Set();
  function checkEntry(stem, component) {
    inside(appRoot, stem);
    if (checked.has(stem)) return;
    checked.add(stem);
    for (const ext of ['js', 'json', 'wxml', 'wxss']) {
      if (!fs.existsSync(stem + '.' + ext)) throw new Error('Missing page/component file: ' + stem + '.' + ext);
    }
    const config = readJson(stem + '.json');
    if (component && config.component !== true) throw new Error('Component flag missing: ' + stem);
    const js = fs.readFileSync(stem + '.js', 'utf8');
    const wxml = fs.readFileSync(stem + '.wxml', 'utf8');
    for (const [, handler] of wxml.matchAll(/\b(?:bind|catch):?[\w]+="([A-Za-z_]\w*)"/g)) {
      if (!new RegExp('\\b' + handler + '\\s*\\(').test(js)) throw new Error('Missing event handler: ' + stem + ' / ' + handler);
    }
    const components = Object.assign({}, app.usingComponents, config.usingComponents);
    for (const target of Object.values(components)) checkEntry(resolveAppPath(appRoot, stem, target), true);
    for (const [, tag] of wxml.matchAll(/<([a-z][\w]*-[\w-]+)\b/g)) {
      // 当前没有使用名称带横线的内置组件；自定义标签须显式注册。
      if (!components[tag]) throw new Error('Unregistered component: ' + stem + ' / ' + tag);
    }
    for (const [, attributes] of wxml.matchAll(/<navigator\b([^>]*)>/g)) {
      const url = attributes.match(/\burl="([^"]+)"/);
      if (!url || url[1].includes('{{')) continue;
      const target = resolveAppPath(appRoot, stem, url[1].split('?')[0]);
      const route = path.relative(appRoot, target).replace(/\\/g, '/');
      if (!app.pages.includes(route)) throw new Error('Unregistered navigator route: ' + route);
      const type = attributes.match(/\bopen-type="([^"]+)"/);
      if (tabs.has(route) !== !!(type && type[1] === 'switchTab')) throw new Error('Incorrect tab navigation: ' + stem + ' -> ' + route);
    }
  }
  for (const route of app.pages) checkEntry(inside(appRoot, path.join(appRoot, route)), false);
  if (app.sitemapLocation) readJson(inside(appRoot, path.join(appRoot, app.sitemapLocation)));
  walk(appRoot, (file) => {
    if (!file.endsWith('.js')) return;
    const source = fs.readFileSync(file, 'utf8');
    for (const [, target] of source.matchAll(/\brequire\(['"]([^'"]+)['"]\)/g)) {
      if (!target.startsWith('.')) throw new Error('Unexpected external dependency: ' + file + ' / ' + target);
      const dependency = inside(appRoot, path.resolve(path.dirname(file), target));
      if (!['.js', '.json'].some((ext) => fs.existsSync(dependency + ext))) throw new Error('Missing module: ' + dependency);
    }
    if (/\bwx\.(request|uploadFile|connectSocket|login|setStorageSync|setStorage|createCamera|startLightSensor|onLightSensorChange)\s*\(/.test(source) || /\.(takePhoto|startRecord)\s*\(/.test(source)) throw new Error('Unexpected API for current stage: ' + file);
    if (appRoot === product && /\bwx\./.test(source)) throw new Error('Stage 1 must not initialize platform services: ' + file);
  });
  return app.pages.length;
}
const pageCount = checkApp(product, path.join(root, 'project.config.json'));
const demoPageCount = checkApp(demo, path.join(demo, 'project.config.json'));
if (pageCount !== 12) throw new Error('Stage 1 must register all 12 planned pages.');
const wxml = fs.readFileSync(path.join(demo, 'pages/index/index.wxml'), 'utf8');
if (!wxml.includes('frame-size="small"') || !wxml.includes('device-position="front"') || !wxml.includes('wx:if="{{cameraMounted}}"')) throw new Error('Demo camera safety attributes missing');
const { EXERCISES } = require('../miniprogram/config/exercises');
if (new Set(EXERCISES.map((item) => item.id)).size !== EXERCISES.length) throw new Error('Duplicate exercise IDs');
for (const item of EXERCISES) {
  const units = { repetitions: '次', duration: '秒' };
  if (!/^[a-z][a-z0-9-]*$/.test(item.id) || !item.name || units[item.measurement] !== item.unit) throw new Error('Invalid exercise definition: ' + item.id);
}
const { APP_INFO } = require('../miniprogram/config/app');
if (APP_INFO.version !== readJson(path.join(root, 'package.json')).version) throw new Error('App/package version mismatch');
console.log('静态检查通过：' + files + ' 个 JS/JSON；正式工程 ' + pageCount + ' 页，独立 Demo ' + demoPageCount + ' 页。');
console.log('页面/组件、导航、模块引用、项目单位与阶段边界检查通过；模板/样式编译请运行 check:wechat。');
