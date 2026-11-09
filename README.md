# 随身健身教练 · 阶段 0

当前只交付**光学计数可行性实验**，不是完整健身小程序。Android / iPhone 摄像头效果均**待真机验证**。用户确认实验结果前不进入下一阶段。

截至 2026-11-09，核查微信官方文档和 npm 最新官方 `miniprogram-api-typings@5.3.1`，未发现公开的环境光传感器读取接口。实验采用公开的 `camera` + `CameraContext.onCameraFrame` 提取亮度；API 存在不能证明遮挡计数在实际机型上可靠。详见[可行性报告](docs/phase-0-feasibility.md)。

## 快速运行

需要 Node.js 20 或更新版本，无 npm 依赖，无需安装包。PowerShell：

```powershell
Set-Location D:\Codes\WechatPushup
node --version
npm.cmd test
npm.cmd run check
npm.cmd run check:wechat
```

使用 `npm.cmd` 可避免 Windows 对 `npm.ps1` 的执行策略限制，不必更改系统执行策略。`check:wechat` 使用已安装开发者工具的本地编译器，本机已通过；若工具装在其他位置，参见测试指南传入目录。

1. 微信开发者工具选择“导入项目”，目录选 `D:\Codes\WechatPushup`，类型选原生“小程序”，不启用云服务。根目录的 `project.config.json` 已指向 `experiments/optical-demo/`。
2. `touristappid` 只供无 AppID 的本地代码/模拟检查；真机预览请换成你自己的合法小程序 AppID，并确认当前微信有开发权限。可在工具中修改 AppID，或修改 `project.config.json` 的 `appid`。
3. 使用当前稳定版开发者工具及可选的稳定基础库 **≥ 2.32.3**。点击编译，出现“光学计数实验室”页面。无需 npm 构建、服务器或合法请求域名配置。
4. 在工具内播放“正常周期”，应新增 3 次；其他四个场景新增 0 次。清零后选择触屏实验，轻触计数、长按不连加。工具环境会提示摄像头实验需真机。
5. 在小程序管理后台的用户隐私保护指引中声明使用相机的实际用途：仅本地提取亮度，画面不保存、不上传。配置后点击工具“预览”，微信扫码进入，在手机上主动开启摄像头并完成隐私与相机授权。
6. 手机平放、屏幕朝上，保持前置镜头无遮挡约 3 秒直到 `READY`；先做 10 次手掌遮挡→移开，再测试实际动作。遮挡镜头不必等同于完成标准动作。

逐步操作、拒绝授权排错和完整测试矩阵见[测试指南](docs/phase-0-testing.md)。请将机型、微信/基础库版本、实际/预期次数、基准亮度、异常和阈值记入[验证记录](docs/validation-results.md)。

## 文件设计

```text
.gitignore                           忽略本地工具配置和审计/编译产物
AGENTS.md                            开发约束与阶段边界
README.md                            运行入口
project.config.json                  开发者工具导入配置
package.json                         零依赖 Node.js 测试命令
docs/
  architecture.md                    全项目方案与后续目录（仅规划）
  phase-0-feasibility.md              官方核查、路径对比、风险与实验设计
  phase-0-testing.md                  PowerShell、导入、预览和真机步骤
  validation-results.md              已完成检查及待真机验证表
  api-audit.json                     API 来源、版本与 npm 完整性标识
experiments/optical-demo/
  app.js / app.json / app.wxss        仅供实验运行的应用壳与隐私回调
  core/
    config.js                        实验参数与灵敏度映射
    luminance.js                     RGBA 中心区域稀疏亮度抽样
    optical-fsm.js                   校准、滤波、迟滞、周期与冷却
    counter.js                       独占自动源、触屏与手动调整
    capabilities.js                  平台、版本、公开能力检测
    signals.js                       五种确定性模拟信号
  pages/index/
    index.js / .json / .wxml / .wxss   信号、校准、计数与降级页面
tests/
  optical.test.js                     算法与异常信号
  counter-luminance.test.js            触摸、帧格式与能力判断
  lifecycle.test.js                   授权、后台、切换、失效回调与计数链路
scripts/
  check.js                           JS/JSON、页面/事件及实验范围静态检查
  check-wechat.ps1                    调用本机微信工具编译WXML/WXSS
  audit-wechat-apis.ps1                可重跑的官方 API 只读核查
```

本阶段不实现训练计划、训练记录存储、统计、云备份或广告。Demo 仅在页面内存中保留次数，重启后清空；复制诊断为用户主动操作，仅含数值和设备/运行版本，不含帧。

本阶段新增 29 个版本控制文件，清单如上；初始项目目录为空，没有覆盖既有项目文件。`.audit/` 内的官方核查副本和编译产物被忽略，不作为运行依赖。

## 验证状态

- Node.js 算法与模拟生命周期25项测试通过；详见验证记录。
- 静态检查、开发者工具内置编译器的 WXML/WXSS 编译通过。
- 开发者工具 GUI 实际运行、Android / iOS 真实取帧、精度、性能及系统资源释放：待验证。
- 实验阈值未经真机定标；没有声称光学运动计数已实现或可发布。
