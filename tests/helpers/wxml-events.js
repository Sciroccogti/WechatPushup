const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 从实际WXML读取按钮与祖先绑定，模拟事件传播/mark；不模拟原生tap合成或渲染。
function trainingEvents(page) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/training/index.wxml'), 'utf8');
  const stack = []; const nodes = [];
  for (const [, closing, tag, text] of source.matchAll(/<(\/?)([\w-]+)\b([^>]*?)>/g)) {
    if (closing) { stack.pop(); continue; }
    const attributes = Object.fromEntries([...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
    const node = { tag, attributes, parent: stack[stack.length - 1] };
    nodes.push(node);
    if (!text.trimEnd().endsWith('/')) stack.push(node);
  }
  const evaluate = (value) => value && value.startsWith('{{') ? vm.runInNewContext(value.slice(2, -2), page.data) : value;
  function chain(node) { const list = []; for (let current = node; current; current = current.parent) list.push(current); return list; }
  function event(node, type, touches) {
    const ancestors = chain(node);
    const mark = {};
    for (const current of [...ancestors].reverse()) for (const [key, value] of Object.entries(current.attributes)) if (key.startsWith('mark:')) mark[key.slice(5)] = evaluate(value);
    for (const current of ancestors) {
      const handler = current.attributes['bind' + type] || current.attributes['bind:' + type] || current.attributes['catch' + type] || current.attributes['catch:' + type];
      if (handler) page[handler]({ type, mark, touches, changedTouches: [{ clientX: 100, clientY: 450 }], currentTarget: { dataset: {} } });
      if (current.attributes['catch' + type] || current.attributes['catch:' + type]) break;
    }
  }
  function button(handler) {
    const node = nodes.find((item) => item.tag === 'button' && (item.attributes.bindtap === handler || item.attributes['bind:tap'] === handler));
    if (!node) throw new Error('Missing WXML button: ' + handler);
    return node;
  }
  return {
    tapButton(handler, runtime) {
      const node = button(handler);
      if (evaluate(node.attributes.disabled)) throw new Error('WXML button disabled: ' + handler);
      event(node, 'touchstart', [{ clientX: 100, clientY: 450 }]);
      runtime.advance(40);
      event(node, 'touchend', []);
      event(node, 'tap', []);
    },
    surfaceTouch() {
      const node = nodes.find((item) => item.attributes.class === 'training-touch-surface');
      event(node, 'touchstart', [{ clientX: 80, clientY: 220 }]); event(node, 'touchend', []);
    }
  };
}
module.exports = { trainingEvents };
