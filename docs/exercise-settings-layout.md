# 0.5.4 分运动设置与准备界面

日期：2026-11-11（Asia/Hong_Kong）。这是阶段5后的用户交互修订，阶段6未开始。

## 行为

设置页内置俯卧撑、仰卧起坐、深蹲、平板支撑四个标签，调参入口也能直接打开当前运动。俯卧撑继续使用光学测试；仰卧起坐和深蹲分别保存陀螺仪参数；平板使用计时器，没有传感器参数。

陀螺仪可调识别轴（胸前竖向X轴/自动）、启动和反向速度阈值、最小往返幅度、方向稳定时间、计数冷却、完整周期最长时间、平滑响应。默认值见 `miniprogram/config/gyro.js`。速度和积分幅度是原始信号阈值，不标注官方未确认的物理单位，也不表示标准动作或姿态。手机仍需固定胸前/上身，参数是待真机验证的实验起点。

主动开启实时测试后先静止校准。拖动即时应用，松手保存；保留静止校准基准与计数冷却，丢弃半周期并等待短暂静止后再接受完整周期。测试次数只用于页面展示，不写入训练结果，也不保存原始采样。设置与训练复用同一配置、状态机和采集服务。

切标签先保存并停止旧硬件，不自动开启新硬件；后台、卸载也释放监听与定时器。异步授权、旧帧与延迟启动回调不能在另一个标签或后台恢复采集。返回训练保留完成量，继续传感器训练需重新校准。

四个项目的执行页在开始前采用视口内纵向布局：上方项目与排序，中间目标/准备状态，下方方式选择、调参入口和大号开始按钮。去掉此时无用的纠错及暂停/结束按钮；计划训练的目标修改、提前完成和跳过放进“本组设置”弹层。选择方式不启动设备，点击“开始训练”才启动。轴选择移到运动设置统一保存。

开始/继续默认最小176rpx，短屏160rpx；准备界面的方式选择最小88rpx。训练中的60vh大触区、手动纠错及大号暂停/结束按钮维持。控件继续使用mark排除计数，不在按钮祖先截断touchstart/touchend。

## 数据

沿用本地键 `fitness.preferences.v1`，负载版本升级为schema3，新增 `gyro.sit-up` 与 `gyro.squat`。读取schema1/2时补默认参数，保留原光学、最近使用、排序与累计训练时长；下一次正常保存才写入schema3。各运动设置独立，恢复某个运动默认值不影响其他运动。仅挑选公开参数字段，未知/损坏/未来版本仍只读保留，不能被调参覆盖。

## 检查

在项目根目录运行：

```powershell
Set-Location D:\Codes\WechatPushup
npm.cmd test
npm.cmd run check
npm.cmd run check:wechat
```

- 90项Node测试通过：包括旧数据迁移/损坏保护、独立运动参数、高低阈值实际改变模拟信号检测、拖动清除半周期、切标签互斥/延迟授权与启动失效、后台/卸载、训练读取参数、本组弹层和开始按钮事件回归。
- 静态检查通过：86个JS/JSON，正式11页，独立Demo1页。
- 本机微信内置wcc/wcsc编译通过：正式14份WXML/16份WXSS，Demo1份WXML/2份WXSS。没有运行开发者工具GUI。
- 使用本机无界面Chrome把训练WXML按当前数据近似转换为HTML，WXSS的rpx换算为vw后测量与截图复核。320×400、320×480、375×500、390×664四种可用视口 × 四运动 × 自由/计划/评估，共48种正常准备状态，未发现纵向溢出或开始按钮超出视口。临时脚本/报告/截图在忽略目录 `.audit/settings-layout/`；此检查不能证明微信原生组件排版、系统字体放大或实际点击通过。
- 复用已经核查的陀螺仪API；本次未新增硬件API或权限。证据与最低基础库见 `docs/phase-5.md`。

## 待验证

1. 微信开发者工具GUI分别打开四个运动的自由、计划和能力测试准备界面：项目、目标、方式与开始按钮无需滑动。检查小屏、长屏、安全区与系统字体放大，异常提示完整可读。
2. 点击方式不采集，点击开始一次响应；平板无需第二次触碰。训练中大触区、按钮及涟漪仍可用，本组弹层操作不误计数。
3. Android/iPhone胸前固定测试：静止校准、正常往返、抖动、不同节奏，边调参边测，调整后的下一完整周期及训练效果；记录漏计/误计。深蹲上身转动小仍可能漏计，保留触屏补充。
4. 实测切标签/后台/锁屏/返回和拒绝权限时，系统硬件指示与采集停止，返回不自动启动；重启后两个运动各自保存的参数仍在。

真机结果继续填写 `docs/validation-results.md`；当前无Android/iPhone实测结论。

## 变更文件

```text
AGENTS.md
README.md
package.json
miniprogram/config/app.js
miniprogram/config/gyro.js
miniprogram/domain/gyro/fsm.js
miniprogram/services/gyro-source.js
miniprogram/services/optical-page.js
miniprogram/services/optical-settings-page.js
miniprogram/services/preferences.js
miniprogram/services/training-page.js
miniprogram/templates/optical-settings.wxml
miniprogram/styles/exercise-settings.wxss
miniprogram/pages/settings/index.wxml
miniprogram/pages/settings/index.wxss
miniprogram/pages/calibration/index.wxml
miniprogram/pages/calibration/index.wxss
miniprogram/pages/training/index.wxml
miniprogram/pages/training/index.wxss
tests/gyro-settings.test.js
tests/optical-integration.test.js
tests/preferences.test.js
tests/start-button.test.js
tests/training.test.js
docs/exercise-settings-layout.md
docs/validation-results.md
```
