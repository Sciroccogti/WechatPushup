# 业务算法边界

按功能阶段建立独立模块：

- counter/manager.js：统一计数、独占自动来源、触摸防抖/长按/多点、手动增减、暂停恢复。
- optical/：亮度抽样、状态机、内部时序参数与模拟信号。源自阶段0算法并在正式路径增加实时 configure；不引用页面或 wx。实验 Demo 保持原版供对照，两个版本分别回归测试。
- training/：能力评估、五组流程、长期计划与调整策略，所有策略参数来自 config/。
- statistics/：从历史记录计算统计，不在页面内累计业务状态。

模块使用 CommonJS，不依赖 wx、Page、Component 或真实系统时间；通过参数注入时间/数据，可在 Node.js 测试。
当前未实现 training/、statistics/，不提供返回假数据的业务接口。
