# 阶段6：本地训练记录与统计（0.6.0）

日期：2026-11-12（Asia/Hong_Kong）。用户明确要求“开发数据记录功能”，本次进入阶段6；不推进阶段7、不接云端或广告。既有传感器和训练策略保持。

## 使用

训练结束后在总结页保存，或离开时按当前疲劳自动保存。保存后可直接进入此条详情。底栏“记录”按日期倒序展示，支持全部/单运动、起止日期筛选和每次20条加载；空数据、读取异常与无匹配分别处理。直接读取既有阶段5结果，不生成或注入示例成绩。

详情包含日期、开始/结束、目的、总目标/实际、完成率、训练用时、实际组间休息、疲劳、计数方式和每组目标/原目标/实际/状态/工作/休息时间。提前结束和跳过保留真实状态。

“数据统计”按单运动显示本周/本月/全部记录的总量、训练次数、实际用时、训练天数、五组计划完成率；另列本周和本月总量、当前/最长连续天数、历史单组和单次总量最高、最近能力评估。每日训练量图展示当前范围内最近最多14天，可横滑；能力成长条形记录展示最近12次手动评估/能力测试。

统计规则：

- 按记录开始日归档，新会话开始时保存localDate；跨午夜训练不拆成两次。旧记录在迁移时按设备当前时区补日期，无法还原旧设备未保存的时区信息。详情中的时分按设备当前时区展示。
- 周一为周起点，月按自然月；按日序号计算连续天数，避免24小时加减带来的夏令时偏差。当天未训练但昨天训练的连续天数继续显示，间隔一天后归零。
- 次数与秒数按运动分开；训练时间使用activeMs，排除暂停/休息/校准/后台。计次训练的次数与“几次训练”分别标注。
- 五组完成率按各次目标加权，每次贡献最多100%；只有五组均完成且非提前结束才列为完成计划。详情展示原始实际/目标比例，因此单条可能超过100%。
- 最好成绩包含该运动全部已保存训练与测试；自由训练总量不等于最大能力。能力趋势只读评估事件；旧版仅能补原先保存的最近能力，不能还原从未保存的历史。
- 连续天数只用于记录，不要求用户每天高强度训练，恢复建议仍按训练计划执行。

## 删除与备份

详情点击删除后在页面内二次确认，写入删除墓碑并从历史/统计移除；不回滚此前已经调整的训练计划，也不改变实际工作时间累计的排序偏好。页面明确说明这一点。已删除记录的旧保存重试或旧备份导入不会复活该ID。

记录页底部导出可复制的JSON文本；长按文本框全选复制并另存。导入粘贴完整文本，先校验并展示新增/重复/冲突/删除拦截数量，再由用户确认合并。未确认不会写入。只包含训练结果、能力事件与计划资料，不包含偏好、图像或原始信号。

按稳定ID合并，重复记录跳过；同ID不同内容、同运动现有计划和评估事件冲突保留本机，冲突源副本仍留在用户原备份文本中。只有本机不存在的运动资料才导入。导入不重放历史结果推进训练周期。备份中的删除标记不会自动删除本机现存记录；本机删除标记优先阻止复活。重复导入幂等，无效/损坏/未来版本文本不写入。导入完成时重新读取本机数据，避免预览后覆盖其他页面的新记录。

当前文本导入限制4,194,304个字符，未实现文件选择、系统分享或网络备份。大量历史数据的文件交互和设备容量/性能仍需后续实机验证。

## 本地文档与事务

所有实际存储API在 `services/storage/local-document.js` 中，页面与领域模块不直接读写wx存储。偏好schema4保持不变。

训练根键仍是 `fitness.training.v1`，schema1单文档首次修改前保存到 `fitness.training.legacy-backup.v1`，备份冲突则停止迁移，不覆盖旧副本；只读浏览不迁移写盘。

schema2训练索引保存revision、profiles、savedOrder、chunks、tombstones和assessments。每个不可变记录块最多20条，键为 `fitness.training.records.v1.<唯一后缀>`；对外snapshot与备份仍合成为统一结果映射。单次追加复用未改变的块，列表只向视图提交20条一页；磁盘读取/统计仍会读全量记录，不声称已做海量数据懒加载。

保存次序为：校验完整新文档 → 写事务日志 `fitness.training.transaction.v1` → 写新分块 → 首次迁移时写旧副本 → 最后单次提交索引 → 清理不再被索引引用的块及日志。容量不足或提交失败时保留原索引/计划，并清理未提交块。进程若在中途退出，下次按当前有效索引清理日志里的非引用块。只删除匹配项目记录块前缀且不被索引引用的键，不扫描或清理其他业务数据。

索引提交成功但清理失败时返回“已保存”并提示稍后清理，不能误判保存失败并重复推进计划。索引/分块/数据损坏或未来版本锁定写入并保留原内容；不静默清空，也不按记录数量自动删除历史。

新记录补revision、updatedAt、localDate；删除保留ID/revision/deletedAt。人工能力评估存独立事件，旧能力基准以legacy标记补入；若旧能力来自已有同次测试则不重复补事件。导入挑选公开字段，原始传感器字段不会混入备份或持久化。

## API依据与边界

2026-11-12直接HTTPS读取官方 [getStorageSync](https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.getStorageSync.html)、[setStorageSync](https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.setStorageSync.html)、[removeStorageSync](https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.removeStorageSync.html) 文档；重新核查官方最新 `miniprogram-api-typings@5.3.1`，下载并校验tarball SHA-512，只读取声明，不执行包脚本。证据位于忽略目录 `.audit/records/`。

官方存储说明为单键1MB、总量10MB，所以记录拆块并处理空间不足。分块降低单键增长，但不会突破微信总容量；迁移副本和提交期间新旧块都暂占空间。容量不足会失败并保留旧数据，不静默删历史。removeStorageSync同步删除指定键，无新增scope，产品基础库建议仍为原相机隐私链路的≥2.32.3。没有新增硬件接口或网络调用。

未来云备份仅保留契约：导出规范数据与稳定ID/revision/updatedAt/删除墓碑，由独立适配器传输；恢复先验证再按明确冲突规则合并，不能按日期或数组位置覆盖。本次没有CloudBackupAdapter空实现、URL、密钥、登录或网络同步。

## 检查与实测

```powershell
Set-Location D:\Codes\WechatPushup
npm.cmd test
npm.cmd run check
npm.cmd run check:wechat
```

119项Node测试通过：原102项保持，新增17项记录专项覆盖日期/运动筛选和分页、周月/跨年/闰日/连续天数、分单位和完成率、能力事件、旧文档备份迁移、块复用、写块/索引/备份失败、提交前后中断恢复、清理失败、损坏保护、导入往返/幂等/冲突/不重复推进、删除失败/确认/墓碑、重启以及实际自由/计时训练到历史详情的完整往返。

静态检查与本机微信wcc/wcsc编译通过：正式12页，15份WXML/17份WXSS；独立Demo1页，1份WXML/2份WXSS。浏览器把真实模板和合成记录近似渲染，在320/390宽度下复核记录/统计/详情6种截图，没有页面横向溢出；图表内部允许横滑。临时截图/报告在 `.audit/records/`。

未运行微信开发者工具GUI或Android/iPhone原生页面。本地模拟和编译不等于实机通过。请在开发者工具及真机检查：

1. 旧安装升级后，原记录/能力/计划显示；完成一条新训练并重启后仍在，首迁移副本存在。
2. 四运动、自由/能力/五组训练、暂停/跳过/提前结束的详情正确；平板单位为秒，休息和暂停不计训练时间。
3. 日期/运动筛选、加载更多、自然周月、连续天数、图表横滑、空态和窄屏显示；大字号与安全区可读。
4. 导出文本框长按全选复制到外部文件，再粘贴预览导入；重复导入、冲突提示、删除确认与旧备份防复活符合页面说明。复制/输入是原生交互，尚未实机证明。
5. 用开发者工具模拟容量不足、缺块/损坏/未来版本，确认原键不清空，保存失败可重试；勿用重要真实数据做破坏测试。

本次仅修改项目内代码与文档，`project.config.json` 用户改动保留且不纳入提交。验证结果追加到 `docs/validation-results.md`。

## 文件清单

```text
AGENTS.md
README.md
package.json
docs/architecture.md
docs/phase-6.md
docs/validation-results.md
miniprogram/app.json
miniprogram/config/app.js
miniprogram/domain/records/backup.js
miniprogram/domain/records/dates.js
miniprogram/domain/records/document.js
miniprogram/domain/records/query.js
miniprogram/domain/training/session.js
miniprogram/services/README.md
miniprogram/services/storage/local-document.js
miniprogram/services/storage/record-document.js
miniprogram/services/training-store.js
miniprogram/pages/history/controller.js
miniprogram/pages/history/index.js
miniprogram/pages/history/index.wxml
miniprogram/pages/history/index.wxss
miniprogram/pages/record-detail/index.js
miniprogram/pages/record-detail/index.json
miniprogram/pages/record-detail/index.wxml
miniprogram/pages/record-detail/index.wxss
miniprogram/pages/statistics/controller.js
miniprogram/pages/statistics/index.js
miniprogram/pages/statistics/index.wxml
miniprogram/pages/statistics/index.wxss
miniprogram/pages/summary/controller.js
miniprogram/pages/summary/index.wxml
scripts/check.js
tests/helpers/record-fixtures.js
tests/helpers/runtime.js
tests/records.test.js
tests/situp.test.js
```
