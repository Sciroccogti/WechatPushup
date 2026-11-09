# 阶段 5：长期计划、五组流程与运动传感器分配

日期：2026-11-10（Asia/Hong_Kong），版本0.5.0。用户要求：只有俯卧撑使用光学；仰卧起坐/深蹲使用陀螺仪；支持累计使用时长排序；进入阶段5。用户补充手机固定在胸前或上身。本次据此完成软件接入，**不将硬件效果记为已验证**。

## 1. 按运动分配计数方式

| 项目 | 自动来源 | 其他方式 | 说明 |
| --- | --- | --- | --- |
| 俯卧撑 | 前置相机亮度（实验） | 触屏、手动纠错 | 仅该项目可以从训练页开启光学，不启用陀螺仪 |
| 仰卧起坐 | 陀螺仪（实验） | 触屏、手动纠错 | 手机竖向固定胸前/上身，默认X轴，可切自动选轴 |
| 深蹲 | 陀螺仪（实验） | 触屏、手动纠错 | 同上；若上身几乎不转动，角速度信号可能不足，不能保证识别 |
| 平板支撑 | 时间戳计时 | 暂停、提前结束组 | 不采集相机或陀螺仪 |

选择方式并不会自动启动硬件；训练页主动点击开始/开启后才采集。切模式、暂停、休息、后台和卸载时停止监听；恢复传感器需重新校准。光学参数仍在设置内实时调节，只用于俯卧撑；设置页本身是显式测试入口，默认不采集。

### 陀螺仪公开API核查

直接读取微信官方文档，并交叉检查此前核查的最新官方类型包5.3.1：

- [wx.startGyroscope](https://developers.weixin.qq.com/miniprogram/dev/api/device/gyroscope/wx.startGyroscope.html)、[wx.onGyroscopeChange](https://developers.weixin.qq.com/miniprogram/dev/api/device/gyroscope/wx.onGyroscopeChange.html)、[wx.stopGyroscope](https://developers.weixin.qq.com/miniprogram/dev/api/device/gyroscope/wx.stopGyroscope.html)：最低基础库2.3.0。
- [wx.offGyroscopeChange](https://developers.weixin.qq.com/miniprogram/dev/api/device/gyroscope/wx.offGyroscopeChange.html)：最低2.9.3；传入与注册时相同的函数对象，不能误删其他监听。
- `interval: 'game'`官方标称回调约20ms，实际频率仍取决于设备；算法使用收到信号的时间戳，不将回调次数当作时间。
- 回调字段x/y/z是三个轴的角速度；本次阅读的字段表没有注明数值单位，因此界面仅显示原始角速度与积分，不给这些值标注未经证实的物理单位。
- 没有虚构`wx.authorize`传感器scope，也没有以相机授权替代陀螺仪。当前源码检查接口和canIUse，失败或无信号降级触屏。工具环境不记硬件通过。

文档副本保存在忽略目录`.audit/phase-5/`。接口存在只证明可以开发采集路径，不能证明胸前固定后能准确识别真实动作。Android/iPhone各自的频率、机身方向、缺失传感器和系统中断均待真机测试。

### 胸前检测算法

`domain/gyro/fsm.js`独立于wx：静止约1.2秒且至少20样本校准偏差/稳定性，滤波后锁定X轴或主轴，检测稳定出程→足够积分幅度→稳定反向→回到起点附近→稳定收尾，完成一次后需安静一段再接受下次。短抖动、单向转动不计数；断流超过300ms重新校准，周期超过6秒报错降级。

内部实验参数：角速度门槛0.4、积分幅度0.25、方向稳定120ms、冷却900ms、滤波alpha0.35。这些是原始信号阈值，不是运动姿态标准或经定标的角度。它检测的是手机转动；手机晃动可能误计，上身角度变化小可能漏计。默认针对用户确认的胸前/上身竖向摆位，自动选轴只用于方向不匹配时试验，不保证更准确。

`gyro-source.js`有单一owner、独立回调、启动/无信号3秒超时、过期回调保护。延迟start成功时不能复活已停止会话；休息时不持续调用stop接口。原始传感器信号不保存或上传。

## 2. 累计时长排序

默认排序改为“累计训练时长”，在项目选择页和设置页都可切换“最近使用”。两处与首页共用偏好：

- 只累计会话`working`状态的时间，含有效能力测试和自由训练；不累计页面浏览、相机/陀螺仪校准、组间休息、暂停和后台。
- 使用时间戳计算，计时器仅刷新显示。每约5秒写入一次检查点，暂停/组结束/离开时补齐差额；只在写入成功后推进已保存标记，重试不会重复加时长。
- 时长相同按最近使用，再按配置顺序稳定排列；“最近使用”仍以进入合法训练页为准，不按计次/计时分区。
- 旧偏好schema1迁移到schema2，保留光学参数与最近ID；旧版本没有时长，不能回推，初始为0。相同存储键下新增`usageMs`、`sortMode`。
- 进程被系统强制清除时，最多可能丢失最近检查点之后尚未保存的活动时间；当前进行中会话仅在内存，后台暂停可继续，进程重启不能恢复未结束会话。崩溃草稿恢复由后续阶段扩展。

## 3. 长期计划策略与依据

先评估单组当前最大有效次数或秒数，可手填/修改，也可进入一次真实测试。最大值为正整数：计次1–1000，计时1–3600秒；0值不生成计划。实际能力测试完成后安排恢复，手动填写已知能力不假设刚完成高强度测试。

训练原则参考[ACSM 2026官方说明](https://acsm.org/resistance-training-guidelines-update-2026/)和[对应立场综述](https://pubmed.ncbi.nlm.nih.gov/41843416/)：逐步、可坚持、根据个体目标调整，复杂周期不是获得训练收益的必要条件。[CDC成人活动建议](https://www.cdc.gov/physical-activity-basics/guidelines/adults.html)同样包含每周多日肌力活动。**本产品的五组形式来自用户需求；具体百分比、恢复间隔和减量周期是可测试的产品启发式，不是这些文献证明的最佳处方，也不从记忆曲线推导训练生理规律。**

所有参数位于`config/training-policy.js`，页面不写训练策略：

| 项目 | 当前产品参数 | 行为 |
| --- | --- | --- |
| 五组比例 | 最大能力×[0.30,0.35,0.30,0.25,0.35]×训练系数 | 正整数取整，至少1且不超过已评估最大值；不同能力生成不同目标 |
| 组间休息 | 基础45秒+相对工作量×60秒+组序×15秒，向15秒取整，上限180秒 | 第五组后无休息；不使用固定示例的五组次数/时间 |
| 常规恢复 | 结束后48小时 | 计划页显示恢复期与下一次建议时间，不自动要求每天训练 |
| 高疲劳/恢复不足 | 72小时 | 降低或维持目标、延长恢复 |
| 稳定表现 | 连续3次完整计划、完成率≥95%、疲劳≤2、恢复足够 | 训练系数×1.05；每次增长后重新积累，不每次/每天机械增长 |
| 完成不足/中断/疲劳高 | 完成率<70%、中断或疲劳≥4 | 系数×0.9，下限0.65 |
| 维持 | 其他情况 | 保持目标并说明原因，取整后训练量也可能不变 |
| 周期减量 | 每第8次完成训练 | 该次系数再×0.7；未完成不消耗周期 |
| 久未训练 | ≥14天 | 当前计划再×0.8，恢复节奏 |
| 重新评估 | 自上次评估完成12次计划 | 提示复测，保留长期完成总数；复测后重置起点、进展系数与当前表现窗口 |
| 系数上限 | 1.5 | 达上限保持并提示重评，不无限推高负荷 |

最近完成次数、近期完成率、主观疲劳、上次结束到本次开始的恢复间隔都进入决策。恢复不足包括连续日训练的情况，不额外鼓励连续高强度打卡。项目进度彼此独立。计划页展示调整原因、五组目标及下一次建议时间；恢复期不会直接开放该次计划训练，仍保留自由训练入口并提示恢复。

目标可在组内调整、提前结束组或跳过；真实目标/实际量和状态都记录。完成率由本次实际与最终调整目标计算，跳过或未完成不当作完整计划。末组自动到目标结束，不要求力竭。低能力（如最大1次）虽会生成每组1次，用户仍应按状态降低动作难度或停止，不强撑数字。

## 4. 会话与页面

```text
首页/项目选择 → 长期计划
  → 无评估：能力评估 → 手动保存或一次测试 → 总结 → 个人计划
  → 可训练：计数方式 → 第1组 → 休息 → 准备 → 第2组 … 第5组 → 总结
  → 恢复期：显示下一训练时间与原因
```

- `TrainingSession`独立状态：idle/working/rest/ready/paused/finished。计时组到目标使用精确时间戳结束，回调变慢也不会多计训练时间。
- 达目标自动进入休息并释放硬件。休息结束显示“就绪”并震动提示；不自动开始计数，用户主动开始下一组。
- 支持提前结束休息、加30秒、暂停/继续、组目标调整、跳过、手动加减与本组清零。上一组在休息页、末组在总结保存前可撤销误计。
- 页面切换用redirect与稳定sessionId，共用单个内存会话；不能同时开启两个训练。计划页可返回未结束会话。
- 后台/进入调参页暂停训练，光学或陀螺仪继续时重校准，次数保留。计时器按暂停点继续，不把后台时间当训练。
- 主动结束或五组完成进入总结，选择1–5疲劳后保存；离开总结自动按当前选择保存，默认疲劳3“适中”。同一sessionId重试保存不重复推进计划。
- 直接离开未结束训练会按中断保存（默认疲劳3）并降低/维持后续量，不当作完整训练；能力测试中断不会改写最大能力。写入失败会提示，不静默清空。

## 5. 本地数据边界

本次引入`LocalDocument`为统一版本化本地文档适配器。偏好更新与训练更新前均重读，避免其他页面的新设置被旧内存覆盖。未知/损坏版本保留原数据并锁写；写入失败保留临时状态并明确提示。

- `fitness.preferences.v1`键，payload schemaVersion2：光学参数、最近项目、排序方式、各项目累计活动毫秒。v1可读取迁移，不写入原始信号。
- `fitness.training.v1`键，schemaVersion1：各项目能力/进展、最近12个表现用于决策，以及按稳定ID存储的训练结果与顺序。结果包含开始/结束、目标/实际、每组工作与实际休息、完成率、模式、疲劳、中断状态。
- **不按训练数量自动删除旧结果。** 目前仍是一个本地文档，达到wx单键容量限制时明确保存失败；阶段6再做分块、历史界面、统计、完整迁移与导入/导出。没有声称这些后续能力已完成。
- 无后端、账号、云同步、广告、图片/视频保存或原始光学/陀螺仪历史。

## 6. Windows命令与验证结果

```powershell
Set-Location D:\Codes\WechatPushup
npm.cmd test
npm.cmd run check
npm.cmd run check:wechat
npm.cmd run simulate -- 180
```

Node.js≥20，零依赖，无需安装包。simulate的假设是能力20次、每3天完成一次、疲劳2；只展示软件规则的半年行为，不预测人体适应。计划与会话都可直接用Node.js测试。

| 检查 | 本次结果 | 边界 |
| --- | --- | --- |
| Node.js回归 | 67项通过 | 原光学/触屏、项目隔离、陀螺仪往返/抖动/断流、存储、排序、完整训练/休息/总结与平板计时 |
| 半年计划模拟 | 通过 | 有递增、有维持、有减量、有恢复日、复测提示，无机械每日增加 |
| 页面完整五组流 | 模拟通过 | 含目标触发休息、暂停/延长/提前结束、保存幂等；不是原生GUI测试 |
| 静态检查 | 通过 | 12页、模块/事件/模板/导航/存储边界 |
| 微信内置编译器 | 正式15WXML/16WXSS、Demo1WXML/2WXSS通过 | 不代表手机已运行 |
| Android/iPhone传感器与真实运动精度 | **待真机验证** | 本次未连接真实设备 |
| 胸前方向、后台释放、界面布局/安全区、耗电 | **待真机验证** | 模拟对象无法证明硬件行为 |

## 7. 导入与真机验收

1. 微信开发者工具导入/打开`D:\Codes\WechatPushup`，根`miniprogram/`，保留原AppID和工具设置，不开启云服务。编译后运动卡片进入计划页；项目选择可切累计时长/最近使用。
2. 先用手动能力填写（例如10次或10秒）检验五组计划，再用触屏/手动推进，检查达目标自动休息、倒计时、暂停/继续、跳过、改目标、结束总结。不要为了测试软件而额外完成高强度动作。
3. 平板支撑用计时器检查目标到时/暂停/休息，校对累计时长。只浏览项目应为0增长，暂停/休息/后台不增长；重新进入后排序与时长保留。
4. 预览用有开发权限的微信扫码。俯卧撑相机仍需后台隐私用途配置与主动同意；仰卧起坐/深蹲不应出现相机预览或相机权限请求，平板不应启动任何传感器。
5. 陀螺仪：手机竖向稳定固定在胸前/上身，先保持静止到READY。分别做仰卧起坐和深蹲，先3轮各10次，记录实际/显示次数与X/Y/Z信号；方向不匹配可试自动选轴。手机静放地面不应被当作有效动作数据。
6. 测试抖动、只有单向动作、缓慢动作、上身角度较小、换轴、无传感器/无回调、系统中断。失败降级后可手动修正，不能因接口返回成功就标记计数准确。
7. 五组中测试休息时传感器停止、下一组主动启动后重新校准；相机和陀螺仪不能同时工作。切后台/锁屏/调参页应暂停，返回不自动采集。
8. 总结选择疲劳4/5后保存，计划应给出降低目标/延长恢复理由；重复保存不重复加完成次数。重新评估应影响该项目起点，不改其他运动。
9. Android/iPhone分别填写：机型/系统、微信/基础库、摆位/检测轴、实际10次与显示次数、五组流/计时、后台资源释放、温升与耗电。结果可续写到阶段0验证表或本文件末尾，始终区分软件模拟和硬件结论。

## 8. 文件清单

新增 19 个文件，修改 40 个既有文件；开始前已有的 `project.config.json` AppID/工具设置改动保留且不纳入本次提交。

```text
新增 docs/phase-5.md
新增 miniprogram/config/training-policy.js
新增 miniprogram/domain/gyro/fsm.js
新增 miniprogram/domain/training/plan.js
新增 miniprogram/domain/training/session.js
新增 miniprogram/pages/assessment/form.js
新增 miniprogram/pages/count-mode/controller.js
新增 miniprogram/pages/plan/controller.js
新增 miniprogram/pages/summary/controller.js
新增 miniprogram/services/gyro-source.js
新增 miniprogram/services/session-runtime.js
新增 miniprogram/services/storage/local-document.js
新增 miniprogram/services/training-page.js
新增 miniprogram/services/training-store.js
新增 miniprogram/templates/optical-settings.wxml
新增 miniprogram/utils/time.js
新增 scripts/simulate-training.js
新增 tests/gyro.test.js
新增 tests/training.test.js
修改 AGENTS.md
修改 README.md
修改 docs/architecture.md
修改 docs/phase-4.md
修改 miniprogram/config/app.js
修改 miniprogram/config/exercises.js
修改 miniprogram/domain/README.md
修改 miniprogram/domain/counter/manager.js
修改 miniprogram/pages/assessment/index.js
修改 miniprogram/pages/assessment/index.wxml
修改 miniprogram/pages/calibration/index.wxml
修改 miniprogram/pages/count-mode/index.js
修改 miniprogram/pages/count-mode/index.wxml
修改 miniprogram/pages/exercises/index.js
修改 miniprogram/pages/exercises/index.wxml
修改 miniprogram/pages/exercises/index.wxss
修改 miniprogram/pages/home/index.js
修改 miniprogram/pages/home/index.wxml
修改 miniprogram/pages/plan/index.js
修改 miniprogram/pages/plan/index.wxml
修改 miniprogram/pages/rest/index.js
修改 miniprogram/pages/rest/index.wxml
修改 miniprogram/pages/rest/index.wxss
修改 miniprogram/pages/settings/index.wxml
修改 miniprogram/pages/summary/index.js
修改 miniprogram/pages/summary/index.wxml
修改 miniprogram/pages/training/index.js
修改 miniprogram/pages/training/index.wxml
修改 miniprogram/services/README.md
修改 miniprogram/services/optical-page.js
修改 miniprogram/services/optical-settings-page.js
修改 miniprogram/services/preferences.js
修改 miniprogram/styles/common.wxss
修改 miniprogram/templates/optical.wxml
修改 miniprogram/utils/exercise-view.js
修改 package.json
修改 scripts/check.js
修改 tests/helpers/runtime.js
修改 tests/optical-integration.test.js
修改 tests/preferences.test.js
```

阶段5后用户授权0.5.1交互修订：取消项目序号与独立选择页、就地排序/选择、传感器与触屏并行、大触区与涟漪反馈。当前行为见[交互修订说明](interaction-update.md)，本文件保留阶段5交付当时的设计和验证记录；阶段6仍未开始。
