# 0.5.5 运动配色与仰卧起坐融合检测

日期：2026-11-11（Asia/Hong_Kong）。用户授权的阶段5后修订，不进入阶段6。

## 界面

- 运动设置与训练调参页移除排序控件、排序说明和事件处理；四个运动标签保留。首页及执行训练页仍能修改排序，共用原偏好。
- 全局页面底色改为浅灰 `#f1f4f8`，文字为海军蓝 `#12243a`，主操作为活力橙 `#c84716`。卡片/输入/警告、空状态、滑块、运动标签及训练反馈统一更新。
- 原生导航栏用 `#111e2f` 配白字，原生底栏用独立深蓝 `#1c2d45`，未选项 `#bdcbe0`、选中项亮橙 `#ff8848`。涟漪及随机全页背景改为同一暖橙色系，继续避免连续同色，保留深色文字可读性。
- 准备界面的一屏布局、大号开始按钮、训练中的大触区和mark事件隔离继续保留。

## 仰卧起坐检测

手机固定胸前/上身，在实际动作的起始姿态静止校准约1.2秒；不能把手机放地面。加速度采样先取得起始向量基准，低通后以方向夹角估计偏离起始姿态的程度；幅值使用相对静止基准的比值，不标注官方字段表未确认的加速度单位。该估计会受平移加速度影响，不能作为人体标准姿态或实际关节角度。

加速度状态机顺序为校准 → 就绪 → 离开 → 完整离开确认 → 返回并稳定 → 计数 → 等待起始姿态稳定。只有完整加速度周期可以发出统一的 `motion` 计数。使用离开/返回迟滞、稳定时长、最短/最长周期、冷却、幅值突变过滤；单向动作、快速半程、未完成周期、冲击和小幅抖动不构成计数。

辅助陀螺仪有效时，在当前加速度周期内累计正反向旋转证据；X轴默认，支持自动选轴。必须有双向证据才能确认该加速度周期，旋转没有独立计数回调。旋转缺接口、失败、超时或断流时显示“仅使用加速度”，丢弃半周期，先回起始姿态再继续。主加速度失败/异常/断流则停两种硬件并降级触屏，保留完成量。

加速度和旋转均在用户点击开始/测试后启动，属于一个运动检测会话。`movement-owner.js` 保证它与深蹲陀螺仪互斥；俯卧撑相机仍通过页面控制器互斥。暂停、休息、切标签、后台和卸载都会移除原监听函数、停止硬件、清定时器。异步回调携带会话及辅助信号标记，过期回调不能更新页面或终止新会话；如果旧加速度迟到启动而新会话是深蹲，会再次停止旧加速度。

触屏仍并行可用，与motion共用600ms跨源去重；加速度半周期已经触屏补数时，该周期完成不会重复加数。旋转单独输入不能绕过这条规则。深蹲继续使用原陀螺仪检测，俯卧撑与平板的检测方式不变。

## 参数与数据

仰卧起坐设置页可实时调离开/返回阈值、稳定时长、最短/最长周期、冷却、平滑响应、允许幅值偏离、辅助旋转阈值及识别轴。拖动立即应用、松手保存；保留起始基准和冷却，清除半周期，回起始姿态后再测。设置与实际训练共用 `config/situp.js`、`domain/situp/fsm.js` 和 `services/situp-source.js`。

偏好键保持 `fitness.preferences.v1`，负载schema升级4，新增 `situp` 字段。兼容schema1/2/3，保留光学、深蹲、旧仰卧起坐陀螺仪参数、累计时长、最近使用及排序。schema3仰卧起坐的识别轴、稳定/冷却/最长周期和平滑参数在新合法边界内迁移；新的加速度阈值采用默认值，原速度/积分幅度阈值不直接套用。保留的旧 `gyro.sit-up` 不再驱动新检测。损坏或未来版本只读保留，未知字段不保存为算法配置。

训练结果沿用原文档版本，仅扩充允许的模式值 `motion`；旧结果仍可读取。同一结果ID仍幂等。原始加速度、旋转和图像数据不写入存储、不上传。

## 官方接口证据

本次直接HTTPS读取微信官方[开始加速度](https://developers.weixin.qq.com/miniprogram/dev/api/device/accelerometer/wx.startAccelerometer.html)、[加速度事件](https://developers.weixin.qq.com/miniprogram/dev/api/device/accelerometer/wx.onAccelerometerChange.html)、[移除监听](https://developers.weixin.qq.com/miniprogram/dev/api/device/accelerometer/wx.offAccelerometerChange.html)、[停止加速度](https://developers.weixin.qq.com/miniprogram/dev/api/device/accelerometer/wx.stopAccelerometer.html)，并下载当次官方最新 `miniprogram-api-typings@5.3.1`，校验tarball SHA-512后只读取类型声明，未执行包脚本。证据在 `.audit/motion/`，结构化结果见 [motion-api-audit.json](motion-api-audit.json)。

start/stop最低1.1.0，`interval`最低2.1.0，off最低2.9.3；完整采集生命周期要求至少2.9.3，产品建议仍为既有相机隐私链路所需的≥2.32.3。注册onAccelerometerChange本身会开始监听，所以注册也限定在用户主动操作之后。`game`约20ms而非定时保证；算法使用时间戳和断流重校准。没有虚构传感器授权scope。辅助陀螺仪复用阶段5已核查API。

## 验证

项目根目录PowerShell：

```powershell
Set-Location D:\Codes\WechatPushup
npm.cmd test
npm.cmd run check
npm.cmd run check:wechat
```

- 102项Node测试通过。新增融合完整周期、纯旋转/噪声/单向/冲击拒绝，主辅信号缺失/失败/中断，延迟启动和新旧会话竞态，实时调参、v3→v4迁移/损坏保护、触屏半周期去重、计划目标后休息释放、返回训练参数/完成量保持。旧深蹲检测回归保留。
- 静态检查通过；正式11页，Demo1页。微信内置wcc/wcsc编译通过：正式14份WXML/16份WXSS，Demo1份WXML/2份WXSS。
- 48种浏览器排版近似检查未溢出：320×400、320×480、375×500、390×664可用视口 × 四运动 × 自由/计划/评估。首页、仰卧起坐设置和准备界面截图已近似复核。浏览器截图中的原生导航/底栏仅按app.json颜色近似绘制，不证明微信原生组件表现。
- 尚未运行微信开发者工具GUI或Android/iPhone真机。需要实测胸前摆位、实际动作误计/漏计、加速度/旋转采样时序、快速运动对方向估计的影响、权限/系统硬件指示、暂停/锁屏/后台释放，以及新配色/底栏和安全区。不能将软件模拟或接口核查记为动作识别通过。

真机结果填写 `docs/validation-results.md`。本次不修改或提交已有 `project.config.json` 用户设置。

## 文件清单

```text
AGENTS.md
README.md
package.json
docs/architecture.md
docs/motion-api-audit.json
docs/sport-theme-situp.md
docs/validation-results.md
miniprogram/app.json
miniprogram/config/app.js
miniprogram/config/exercises.js
miniprogram/config/situp.js
miniprogram/domain/counter/manager.js
miniprogram/domain/situp/fsm.js
miniprogram/services/README.md
miniprogram/services/gyro-source.js
miniprogram/services/movement-owner.js
miniprogram/services/optical-settings-page.js
miniprogram/services/preferences.js
miniprogram/services/situp-source.js
miniprogram/services/training-page.js
miniprogram/services/training-store.js
miniprogram/components/empty-state/index.wxss
miniprogram/styles/common.wxss
miniprogram/styles/exercise-settings.wxss
miniprogram/styles/optical.wxss
miniprogram/templates/optical-settings.wxml
miniprogram/utils/touch-feedback.js
miniprogram/pages/calibration/index.wxml
miniprogram/pages/count-mode/controller.js
miniprogram/pages/home/index.wxml
miniprogram/pages/home/index.wxss
miniprogram/pages/settings/index.wxml
miniprogram/pages/training/index.wxml
miniprogram/pages/training/index.wxss
tests/gyro-settings.test.js
tests/gyro.test.js
tests/helpers/runtime.js
tests/helpers/situp-signal.js
tests/optical-integration.test.js
tests/preferences.test.js
tests/situp.test.js
tests/start-button.test.js
tests/touch-interaction.test.js
tests/training.test.js
```
