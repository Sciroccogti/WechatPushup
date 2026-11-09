# 阶段 4：光学软件接入、实时调参与最近使用

日期：2026-11-10（Asia/Hong_Kong），版本 0.4.0。用户明确要求跳到阶段 4、取消计次/计时分组并按最近使用排序。本次同时实现光学接入必需的阶段 3 统一计数与触屏降级依赖，没有推进五组计划、训练记录/统计、备份或平板计时。

**验证级别：软件接入与模拟回归通过；光学硬件效果待 Android/iPhone 真机验证。** 没有用模拟结果宣称实际运动计数可用。

## 使用与行为

### 最近使用

打开带合法 exerciseId 的训练页，就将该项目稳定 ID 移到最近列表首位，去重并本地保存。首页和项目选择页在 onShow 重新读取；未使用项目按原配置顺序排后面。取消计次/计时分区，卡片仍保留次/秒单位。非法 ID 不写入；不依赖系统时间，因此同毫秒多次选择也没有排序歧义。

### 自由计数

- 触屏开始后，单指 touchstart 只加一次；长按不连加，600 ms 最小间隔，多个触点须全部松开后才解锁。
- “开启光学”是主动启用相机的动作，走隐私同意、scope.camera 授权、前置 camera 挂载、initdone、帧监听与校准。光学完整稳定暗→亮周期由同一个计数管理器接收，与触屏互斥。
- 手动 +1、撤销和清零只调整当前页面次数；暂停不接收加数，继续光学会重校准。结束/切后台/离开停止采集，次数仅当前页面内存保留，没有保存训练记录。
- 权限拒绝、能力不足、初始化/无帧超时、坏帧、过暗、不稳定、持续遮挡或环境漂移在训练页有原因并降级触屏，已计次数保留。
- 平板支撑当前仅显示计时准备中，无法启动相机；不因接入计次能力而给计时项目申请硬件权限。

### 设置中边测边调

底部“设置”和训练页的“光学阈值与实时测试”共用同一个页面工厂与模板。后者使用非底部校准路由，让原训练页保持在返回栈中，后台暂停；调参后返回保留次数、载入新参数，需主动继续。

设置页默认不采集。点击开启相机，校准后显示原始/平滑亮度、基准、相对比值、状态、阈值对应亮度和测试次数。滚动时顶部实时读数条保持可见；测试结果仅存在内存。没有设备时可播放三个模拟周期，必须区分“模拟信号”与“相机亮度”。

| 参数 | 默认 / 可调范围 | 含义 |
| --- | --- | --- |
| 遮挡阈值 | 基准62%；10%–90% | 平滑亮度低于此值才开始遮挡候选，调高一般更容易触发 |
| 恢复阈值 | 基准82%；15%–98% | 必须恢复到此值并持续足时，才可能完成一次周期 |
| 遮挡最短持续 | 250 ms；100–1000 ms | 过滤短暂变暗 |
| 恢复最短持续 | 250 ms；100–1000 ms | 过滤恢复抖动 |
| 冷却 | 900 ms；300–2500 ms | 两次已完成周期之间的最小时间 |
| 信号响应 | alpha=35%；10%–100% | 越低越平滑，响应也越慢 |

恢复阈值始终比遮挡阈值高至少5个百分点，拖动越过另一个阈值时会同步调整另一个，避免失去迟滞。滑动即应用，松手保存一次；调参保留相机、基准、平滑值和冷却历史，清除未完成周期，因此不能把修改前的半个周期补成一次。改变环境光后手动重新校准。

在设置页，过暗/不稳定等算法故障保留实时亮度用于观察，但暂停计数，需要重新校准；相机权限、坏帧和超时等采集故障则释放相机。停止、切页面、后台、卸载都清理帧监听和定时器。返回不会自动偷偷开相机，主动继续时再校准。

默认值均为实验起点，不是已定标参数，也不是个体运动处方。前置图像亮度不是照度 lux，镜头自动曝光、画面内容和摆位会影响信号，算法不识别姿态或动作质量。

## API 与实现决策

本次重新运行官方 API 核查脚本：npm latest 为 `miniprogram-api-typings@5.3.1`，tarball SHA-512 通过，环境光关键词仍无匹配。原报告的“没有找到公开环境光读取接口”结论不变。

- 相机沿用 [camera](https://developers.weixin.qq.com/miniprogram/dev/component/camera.html) 与 [onCameraFrame](https://developers.weixin.qq.com/miniprogram/dev/api/media/camera/CameraContext.onCameraFrame.html)，帧接口最低2.7.0。本版完整隐私流程要求基础库≥2.32.3。
- [createCameraContext](https://developers.weixin.qq.com/miniprogram/dev/api/media/camera/wx.createCameraContext.html) 的公开类型是无参数调用；因此 camera 放在页面 WXML 模板中，没有虚构组件查找参数或环境光 API。同页仅一个相机。
- [requirePrivacyAuthorize](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/privacy/wx.requirePrivacyAuthorize.html) 由应用级隐私监听转交当前页面，真实同意按钮后才继续；页面隐藏时拒绝未决请求。初始化12秒超时从硬件挂载开始，不把用户阅读隐私指引的时间当相机故障。
- [getStorageSync](https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.getStorageSync.html)、[setStorageSync](https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.setStorageSync.html) 仅用于独立偏好命名空间，不在帧回调中读写。
- 处理帧约10Hz、界面约5Hz，中心稀疏抽样；画面不落盘、不上传、不拍照、不录像、不申请麦克风。原始帧不进入 data 或 storage。
- 共享源码作为页面方法组合而不是跨工程运行依赖；正式算法源于阶段0并新增 configure。原 Demo 保持冻结对照，两套算法都有回归覆盖。
- 会话标记使旧授权/帧/start回调失效；相机节点绑定自己的会话编号，旧节点的 error/stop/initdone 不影响新会话。延迟start成功后会再次停止旧监听。

官方文档只读副本在忽略目录 `.audit/phase-4/`，最新类型审计在 `.audit/report.json`。没有安装或执行类型包代码，没有新增运行依赖。

## 本地数据

键 `fitness.preferences.v1` 的结构：

```json
{
  "schemaVersion": 1,
  "optical": {
    "darkRatio": 0.62,
    "lightRatio": 0.82,
    "minDarkMs": 250,
    "minLightMs": 250,
    "cooldownMs": 900,
    "alpha": 0.35
  },
  "recentExerciseIds": ["push-up", "plank"]
}
```

只允许六项公开调参字段进入算法，丢弃未知配置字段。数据损坏/未来版本时保留原数据并锁定写入，显示默认/临时值提示；读写异常也提示，不清空或覆盖原数据。当前没有训练记录、照片、帧、亮度历史、账号信息或云端内容。训练数据完整迁移与备份仍由阶段6及后续实现。

## PowerShell 与开发者工具

```powershell
Set-Location D:\Codes\WechatPushup
npm.cmd test
npm.cmd run check
npm.cmd run check:wechat
```

无 npm 依赖，无需安装包。默认导入 `D:\Codes\WechatPushup`，小程序根 `miniprogram/`，使用现有 AppID，不开启云开发。稳定基础库≥2.32.3。非默认工具位置可用 `check-wechat.ps1 -ToolRoot '<实际安装目录>'`。

1. 工具中先打开深蹲或平板支撑，返回首页/列表检查顺序，再重新编译/重启验证排序保存。列表不再分组；无记录时为配置顺序。
2. 计次项目开始触屏，测试长按、多点、快速重复、暂停、+1/撤销和模式切换；光学无法采集时应降级触屏并保留次数。
3. 设置→播放模拟周期，默认设置应新增3次。拖动阈值会改变模拟结果，这是算法响应参数的体现，不是硬件验证。
4. 真机预览前，在小程序后台的用户隐私保护指引如实声明相机用途，确保扫码微信有该 AppID 开发权限。点击工具预览，用手机扫码。
5. 手机设置→主动开启前置摄像头，同意隐私和相机授权，镜头无遮挡约3秒到READY。先做10个手掌遮挡/移开周期，观察亮度和计数，再测实际俯卧撑。
6. 保持相机运行，滚动调阈值/持续/冷却；顶部读数条应可见。拖动不应重新开相机或丢基准，不应把半周期补计；松手后重进页面应保留参数。更换光照后重新校准。
7. 自由训练中进入“光学阈值与实时测试”，原计数应暂停；调参返回次数保留，主动继续重新校准。设置中的测试次数不计入原训练。
8. 分别验证拒绝授权、系统关闭相机权限、无帧、持续遮挡/低光、后台/锁屏/离开/重开。确认硬件采集释放、旧源不计数，失败后触屏可用。
9. Android/iPhone分别记录机型、微信/基础库、明暗比值、参数、手掌10周期和实际动作3轮各10次的读数、静置误计、温升/耗电与资源释放。手掌通过不能代替实际动作通过。

## 验证记录

| 检查 | 结果 | 验证边界 |
| --- | --- | --- |
| Node测试 | 50项通过 | 包括新排序/本地读写、实时参数、正式算法、统一计数、模拟权限/帧链路和资源生命周期 |
| 静态检查 | 通过 | 12正式页+1Demo页，覆盖共享模板/页面组合方法、模块、导航、存储边界与相机条件挂载 |
| 正式原生编译器 | 14份WXML、16份WXSS通过 | 包含共享模板与样式，不等于微信GUI运行 |
| 独立Demo编译 | 1份WXML、2份WXSS通过 | 原运行代码保持不变 |
| 官方文档/最新类型 | 已核查 | 5.3.1包校验通过；公开API存在不等于真机可用 |
| 新界面/真实隐私授权/取帧/动作精度/硬件释放 | **待真机验证** | 本次未连接Android或iPhone设备 |

## 新增与修改文件

以下清单包含本次变更，不含开始前已有的用户 `project.config.json` 改动；AppID和工具设置保留且不提交。

新增 17 个文件，修改 29 个既有文件。

```text
新增 docs/phase-4.md
新增 miniprogram/config/optical.js
新增 miniprogram/domain/counter/manager.js
新增 miniprogram/domain/optical/config.js
新增 miniprogram/domain/optical/fsm.js
新增 miniprogram/domain/optical/luminance.js
新增 miniprogram/domain/optical/signals.js
新增 miniprogram/services/camera-capabilities.js
新增 miniprogram/services/optical-page.js
新增 miniprogram/services/optical-settings-page.js
新增 miniprogram/services/preferences.js
新增 miniprogram/styles/optical.wxss
新增 miniprogram/templates/optical.wxml
新增 tests/helpers/runtime.js
新增 tests/optical-integration.test.js
新增 tests/preferences.test.js
新增 tests/production-optical.test.js
修改 AGENTS.md
修改 README.md
修改 docs/architecture.md
修改 docs/phase-2.md
修改 miniprogram/app.js
修改 miniprogram/app.wxss
修改 miniprogram/config/app.js
修改 miniprogram/domain/README.md
修改 miniprogram/pages/calibration/index.js
修改 miniprogram/pages/calibration/index.json
修改 miniprogram/pages/calibration/index.wxml
修改 miniprogram/pages/exercises/index.js
修改 miniprogram/pages/exercises/index.wxml
修改 miniprogram/pages/exercises/index.wxss
修改 miniprogram/pages/home/index.js
修改 miniprogram/pages/home/index.wxml
修改 miniprogram/pages/settings/index.js
修改 miniprogram/pages/settings/index.json
修改 miniprogram/pages/settings/index.wxml
修改 miniprogram/pages/settings/index.wxss
修改 miniprogram/pages/training/index.js
修改 miniprogram/pages/training/index.json
修改 miniprogram/pages/training/index.wxml
修改 miniprogram/pages/training/index.wxss
修改 miniprogram/services/README.md
修改 miniprogram/utils/exercise-view.js
修改 package.json
修改 scripts/check.js
修改 tests/pages.test.js
```

阶段4交付后用户已授权阶段5，并要求仅俯卧撑开放光学、仰卧起坐/深蹲改用胸前/上身陀螺仪，同时支持累计训练时长排序。当前行为见[阶段5文档](phase-5.md)，本文件保留阶段4历史记录。
