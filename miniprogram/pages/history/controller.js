const { TrainingStore } = require('../../services/training-store');
const { EXERCISES } = require('../../config/exercises');
const { history, validDay } = require('../../domain/records/query');
module.exports = {
  data: { exerciseOptions: ['全部运动', ...EXERCISES.map((e) => e.name)], exerciseIndex: 0, startDate: '', endDate: '', groups: [], total: 0, hasMore: false,
    warning: '', message: '', locked: false, dataPanel: '', backupText: '', importText: '', importReport: null },
  onLoad() { this._store = new TrainingStore(wx); this._limit = 20; },
  onShow() { this._refresh(); },
  _refresh() {
    const doc = this._store.snapshot();
    const filters = { exerciseId: this.data.exerciseIndex ? EXERCISES[this.data.exerciseIndex - 1].id : '', start: this.data.startDate, end: this.data.endDate };
    this.setData({ ...history(doc, filters, this._limit), warning: this._store.warning, locked: this._store.locked });
  },
  onExerciseChange(event) { const index = Number(event.detail.value); if (!Number.isInteger(index) || index < 0 || index > EXERCISES.length) return; this.setData({ exerciseIndex: index }); this._limit = 20; this._refresh(); },
  onDateChange(event) {
    const key = event.currentTarget.dataset.key, value = event.detail.value;
    if (!['startDate', 'endDate'].includes(key) || !validDay(value)) return;
    const start = key === 'startDate' ? value : this.data.startDate, end = key === 'endDate' ? value : this.data.endDate;
    if (start && end && start > end) return this.setData({ message: '开始日期不能晚于结束日期。' });
    this.setData({ [key]: value, message: '' }); this._limit = 20; this._refresh();
  },
  resetFilters() { this.setData({ exerciseIndex: 0, startDate: '', endDate: '', message: '' }); this._limit = 20; this._refresh(); },
  loadMore() { this._limit += 20; this._refresh(); },
  onReachBottom() { if (this.data.hasMore) this.loadMore(); },
  openExport() {
    try { this.setData({ backupText: this._store.exportBackup(Date.now()), dataPanel: 'export', importReport: null, message: '' }); }
    catch (e) { this.setData({ message: e.message }); }
  },
  openImport() { this.setData({ dataPanel: 'import', importText: '', importReport: null, message: '' }); },
  closeDataPanel() { this.setData({ dataPanel: '', backupText: '', importText: '', importReport: null }); },
  onImportInput(event) { this.setData({ importText: event.detail.value, importReport: null }); },
  previewImport() {
    try { this.setData({ importReport: this._store.previewImport(this.data.importText), message: '' }); }
    catch (e) { this.setData({ importReport: null, message: e.message }); }
  },
  confirmImport() {
    if (!this.data.importReport) return;
    try {
      const result = this._store.importBackup(this.data.importText);
      if (!result.saved) return this.setData({ message: this._store.warning });
      this.setData({ dataPanel: '', importText: '', importReport: null, message: '导入完成：新增 ' + result.report.added + ' 条；重复 ' + result.report.duplicates + ' 条；冲突保留本机 ' + result.report.conflicts + ' 条。' });
      this._refresh();
    } catch (e) { this.setData({ message: e.message }); }
  }
};
