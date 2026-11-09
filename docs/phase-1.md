# 阶段 1：正式原生工程骨架

用户明确要求“进入阶段1”，本次据此建立正式工程；该授权不等于阶段 0 的 Android/iPhone 光学实验已经通过。相机实验仍独立保留，正式工程不接入相机。

## 本次范围与目录

```text
project.config.json                      默认指向 miniprogram/，保留已有 AppID 和工具设置
miniprogram/
  app.js / app.json / app.wxss            原生应用壳、12页注册、3个原生底部入口
  sitemap.json                           开发阶段关闭搜索索引
  config/
    app.js                               应用名称与版本
    exercises.js                         四项目稳定 ID、计次/计时类型与单位
  styles/common.wxss                     通用页面布局、色彩、按钮与底部安全区
  components/empty-state/
    index.js / .json / .wxml / .wxss       功能准备中状态与回首页导航
  pages/
    home/                                启动页壳，入口到运动项目/记录
    exercises/                           运动项目选择壳
    assessment/                          初始能力测试壳
    plan/                                长期训练计划壳
    count-mode/                          计数模式选择壳
    calibration/                         光学校准壳，明确尚未开放
    training/                            训练执行壳
    rest/                                组间休息壳
    summary/                             训练总结壳
    history/                             记录壳，入口到数据统计
    statistics/                          数据统计壳
    settings/                            设置壳，显示应用版本
  domain/README.md                       计数、训练、统计的领域边界
  services/README.md                     存储、仓库、未来备份的服务边界
experiments/optical-demo/
  project.config.json                    新增独立导入配置，原实验代码保留
```

每个 `pages/<名称>/` 均包含 `index.js`、`index.json`、`index.wxml`、`index.wxss` 四个文件。页面使用 WXML/WXSS/JavaScript/JSON 和原生 App/Page/Component，无框架、构建依赖、第三方图标或外部图片。

当前是工程骨架：主页与页面壳只显示真实的“准备中”状态，没有假训练记录、默认达标次数或可误认为正在工作的训练按钮。阶段 2 再完善首页、项目选择和基础训练界面，正式触屏计数到阶段 3、光学按阶段 4 决策、计划到阶段 5、存储/统计到阶段 6。

## 模块边界

- `config/`：静态配置；运动定义暂不声明任何计数方式已可用。平板支撑单位为秒，其余三项为次。
- `domain/`：未来无 wx 依赖的业务模块，可由 Node.js 测试。当前仅记录职责，不实现假的计划、计数或统计接口。
- `services/`：未来平台和数据适配器。当前无 storage 初始化、服务器地址、云函数、密钥或网络调用。
- `pages/`：仅处理展示和后续交互；跨页跳转用原生 navigator，底部页使用 switchTab，普通页面使用 navigate。
- `components/`：空状态组件独立样式，页面通用样式由 app.wxss 引入，避免依赖样式穿透。
- `experiments/`：不位于正式小程序打包根中。正式 App 启动不加载实验算法、权限回调或硬件资源。

## 本次修改文件

本次新增 63 个文件（正式工程 61 个、实验导入配置 1 个、本交付文档 1 个），修改 10 个既有文件；没有删除现有文件。

除上面新增的正式文件和 Demo 导入配置外，修改：

- `AGENTS.md`：记录新的阶段授权与正式根目录，不将光学状态改记为通过。
- `README.md`：默认运行正式工程，给出两套工程的独立入口。
- `package.json`：应用元数据升级为 0.1.0，保留零依赖和原测试命令。
- `project.config.json`：仅变更项目描述、名称与小程序根目录。工作目录原有 AppID/工具设置保持；它们是本次开始前的用户改动，不纳入阶段提交。
- `scripts/check.js`：同时校验两套工程的文件、页面/组件、静态导航、模块依赖、运动单位及阶段边界。
- `scripts/check-wechat.ps1`：调用已安装微信工具编译两套工程的全部 WXML/WXSS，包含公共样式导入；输出只到忽略目录 `.audit/`。
- `docs/architecture.md`：更新已建立目录与阶段状态。
- `docs/phase-0-feasibility.md`、`docs/phase-0-testing.md`：更新 Demo 独立导入路径。
- `docs/validation-results.md`：仅记录阶段 1 已授权，保留全部硬件待验证项。
- `docs/phase-1.md`：本阶段交付与验证记录。

## PowerShell 检查命令

```powershell
Set-Location D:\Codes\WechatPushup
npm.cmd test
npm.cmd run check
npm.cmd run check:wechat
```

需要 Node.js ≥20；没有包依赖，不运行 npm install。`npm.cmd` 避免 Windows 的 npm.ps1 执行策略限制。编译命令使用系统已安装工具，不启动窗口、不上传代码；非默认安装位置可传入：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-wechat.ps1 -ToolRoot 'C:\Program Files (x86)\Tencent\微信web开发者工具'
```

## 开发者工具导入与验收

1. 默认工程导入 **`D:\Codes\WechatPushup`**，类型“小程序”，读取根 `project.config.json`，确认 `miniprogramRoot` 为 `miniprogram/`。不启用云开发，不构建 npm。
2. 根配置已保留你设置的 AppID 和开发者工具选项。使用可用的稳定基础库；本项目检查环境沿用阶段 0 建议的 ≥2.32.3。正式骨架不申请硬件授权。
3. 点击编译；若已有的工程窗口仍显示光学实验，关闭该工程窗口后重新导入仓库根目录，避免工具沿用旧入口。无需更改或清除本地数据。
4. 默认应出现“随身健身教练”启动页，底部“训练、记录、设置”可切换。
5. 首页“查看运动项目”应进入功能准备中页，可用系统返回或组件“回到首页”。首页“查看训练记录”切到底部记录页，记录页“查看数据统计”进入统计壳。
6. 其余页面尚未串联成训练流程；可以在工具自定义编译条件中填写 `app.json` 已注册的页面路径，分别编译检查。页面路径不含 `.wxml` 后缀。
7. 点击“预览”，使用具有该 AppID 开发权限的微信扫码。观察窄屏、iPhone 底部安全区和原生导航栏；本阶段没有训练计数可测试。无需登录授权、相机权限或网络后端。
8. 继续验证光学 Demo 时，另行导入 **`D:\Codes\WechatPushup\experiments\optical-demo`**，使用其独立配置。初始为游客 AppID，真机预览需在该实验工程中填入自己的 AppID，按阶段 0 指南配置隐私并测试。

默认编译入口是正式工程，与独立 Demo 互不加载业务代码；不通过频繁修改仓库根配置切换实验。

## 验证记录

| 检查 | 本次结果 | 限制 |
| --- | --- | --- |
| Node.js 既有25项测试 | 全部通过 | 阶段0算法和模拟生命周期回归，不是硬件测试 |
| JS/JSON与引用检查 | 通过 | 12个正式页面、1个Demo页面；组件与静态导航、模块依赖合法 |
| 正式 WXML 编译 | 13份通过 | 12页+1个组件；本机开发者工具内置wcc |
| 正式 WXSS 编译 | 15份通过 | 应用、通用样式、12页+1个组件；本机内置wcsc |
| Demo 编译回归 | 1份WXML、2份WXSS通过 | 原实验运行代码未迁入正式工程 |
| 开发者工具 GUI 运行、页面跳转、真机安全区 | 待用户验证 | 本次完成的是本地编译检查，未自动操作GUI/手机 |
| Android/iPhone光学效果 | 仍待真机验证 | 阶段1没有改变硬件验证结论 |

本次沿用普通 WebView 原生页面与组件；没有引入 Skyline、插件、额外 SDK 或未经核查的新硬件 API。工程配置与导航写法已核对[微信全局配置](https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html)、[自定义组件](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/)、[navigator](https://developers.weixin.qq.com/miniprogram/dev/component/navigator.html)官方文档，副本在 `.audit/phase-1/`。`sitemapLocation` 按全局配置声明，开发阶段禁止搜索索引，发布前重审。

阶段 1 完成后停止，不自动进入阶段 2。
