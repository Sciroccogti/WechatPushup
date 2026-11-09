# 业务算法边界

按功能阶段建立独立模块：

- counter/manager.js：统一计数、独占自动来源、触摸防抖/长按/多点、手动增减、暂停恢复。
- optical/：亮度抽样、状态机、内部时序参数与模拟信号。源自阶段0算法并在正式路径增加实时 configure；不引用页面或 wx。实验 Demo 保持原版供对照，两个版本分别回归测试。
- gyro/fsm.js：静止校准、选轴、滤波、出程/回程/稳定完成检测；不判断人体姿态，不在没有完整周期时加数。
- training/plan.js：能力评估、五组目标/休息、恢复/进展/减量/复测规则，参数来自config/training-policy.js。
- training/session.js：训练、休息、准备、暂停、完成状态机；计时由注入时间戳计算，仅working累计活动时长。
- statistics/：从历史记录计算统计，不在页面内累计业务状态。

模块使用 CommonJS，不依赖 wx、Page、Component 或真实系统时间；通过参数注入时间/数据，可在 Node.js 测试。
当前未实现statistics/，不提供返回假数据的业务接口；策略参数需随实测调整，不宣称运动处方已验证。
