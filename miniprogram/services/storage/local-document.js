const clone = (value) => JSON.parse(JSON.stringify(value));

// 小型版本化本地文档。无法识别的数据只读保留，不静默清空。
class LocalDocument {
  constructor(api, key, fresh, parse) { this.api = api; this.key = key; this.fresh = fresh; this.parse = parse; this.value = fresh(); this.warning = ''; this.locked = false; }
  load() {
    this.warning = ''; this.locked = false;
    try {
      const raw = this.api.getStorageSync(this.key);
      this.value = raw === '' || raw === undefined ? this.fresh() : this.parse(clone(raw));
    } catch (_) { this.locked = true; this.warning = '本地数据无法读取或版本不受支持，临时使用默认值，不覆盖原数据。'; }
    return clone(this.value);
  }
  update(change) {
    this.load();
    const next = clone(this.value);
    change(next);
    this.value = this.parse(next);
    if (this.locked) return false;
    try { this.api.setStorageSync(this.key, clone(this.value)); this.warning = ''; return true; }
    catch (_) { this.warning = '本地保存失败，当前改动仅临时生效，请勿关闭页面。'; return false; }
  }
}
// 所有持久化API保持在适配器内，分块仓库只操作这些同步方法。
const storageIO = {
  read(api, key) { return api.getStorageSync(key); },
  write(api, key, value) { api.setStorageSync(key, clone(value)); },
  remove(api, key) { api.removeStorageSync(key); }
};
module.exports = { LocalDocument, storageIO };
