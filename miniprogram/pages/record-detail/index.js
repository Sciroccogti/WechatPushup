const { TrainingStore } = require('../../services/training-store');
const { recordView } = require('../../domain/records/query');
Page({
  data: { record: null, warning: '', confirming: false, removed: false },
  onLoad(options) { this._id = options && options.id; this._store = new TrainingStore(wx); },
  onShow() { const result = this._store.result(this._id); this.setData({ record: result ? recordView(result) : null, warning: this._store.warning, confirming: false }); },
  askDelete() { if (this.data.record) this.setData({ confirming: true }); },
  cancelDelete() { this.setData({ confirming: false }); },
  confirmDelete() {
    if (!this.data.confirming || !this.data.record) return;
    if (!this._store.removeResult(this._id, Date.now())) return this.setData({ warning: this._store.warning });
    this.setData({ record: null, confirming: false, removed: true, warning: '' });
  }
});
