# 随身健身教练

微信原生小程序，使用 WXML、WXSS、JavaScript 和 JSON。本地优先、无需登录或后端，按阶段开发。

**当前已完成阶段 1：正式工程骨架。** 用户已明确授权进入本阶段；正式工程具有应用壳、12 个页面入口、公共组件与模块边界，业务功能将在后续阶段实现。阶段 0 光学实验单独保留，Android/iPhone 硬件与计数效果仍待真机验证。

## 快速检查

需要 Node.js 20 或更新版本；无依赖，不必 npm install。PowerShell：

```powershell
Set-Location D:\Codes\WechatPushup
npm.cmd test
npm.cmd run check
npm.cmd run check:wechat
```

- `test`：既有 25 项光学、触屏与模拟生命周期测试。
- `check`：两套工程的 JS/JSON、页面/组件、静态导航、模块引用、运动配置与阶段边界。
- `check:wechat`：调用本机微信开发者工具内置 wcc/wcsc，编译全部模板与样式；产物写到忽略目录 `.audit/`。工具安装在其他目录时，参见[阶段 1 指南](docs/phase-1.md)。

`npm.cmd` 避免 Windows 对 npm.ps1 的执行策略限制，无需更改系统执行策略。

## 导入正式工程

1. 微信开发者工具导入 **`D:\Codes\WechatPushup`**，类型选择“小程序”，不启用云开发。
2. 根 `project.config.json` 指向 **`miniprogram/`**，现有 AppID 和工具设置已保留。使用稳定基础库，建议沿用 ≥2.32.3。
3. 点击编译，默认显示启动页，底部有“训练、记录、设置”。若旧工程窗口仍显示光学实验，关闭后重新导入仓库根目录。
4. 首页可进入运动项目壳和记录壳，记录页可进入统计壳；其余页面可通过自定义编译条件按已注册路径检查。当前均为“功能准备中”，尚未接入训练业务。
5. 点击预览，使用具有该 AppID 开发权限的微信扫码；检查页面跳转、窄屏和底部安全区。本阶段不会申请登录或相机权限。

完整文件清单、编译条件、检查结果与导入说明见[阶段 1 交付文档](docs/phase-1.md)。

## 目录

```text
AGENTS.md                         阶段边界与开发约束
project.config.json               默认正式工程入口
package.json                      零依赖检查命令
miniprogram/
  app.js / app.json / app.wxss     原生应用壳、页面注册和全局样式
  sitemap.json                    开发阶段搜索索引配置
  config/                         应用信息、四种运动的稳定ID/类型/单位
  styles/                         公共布局和视觉样式
  components/empty-state/         功能准备中状态组件
  pages/                          12个页面，每页包含JS/JSON/WXML/WXSS
  domain/README.md                后续计数、训练、统计的独立算法边界
  services/README.md              后续本地存储、仓库与备份适配器边界
experiments/optical-demo/
  project.config.json             独立导入实验的入口
  app.* / core/ / pages/          阶段0原始实验，未并入正式工程
scripts/                          静态检查、微信编译、官方API核查
tests/                            阶段0算法与模拟生命周期回归测试
docs/                             方案、分阶段交付和测试记录
```

四种运动配置为俯卧撑、仰卧起坐、深蹲（次）及平板支撑（秒）。本阶段只定义配置，不把任何计数方式标为已可用。训练、正式触屏计数、光学接入、计划、存储与统计分别按后续阶段实现。

## 继续使用光学 Demo

另行导入 **`D:\Codes\WechatPushup\experiments\optical-demo`**，使用实验目录自己的 `project.config.json`；初始为游客 AppID，真机预览前在该实验工程填写自己的 AppID，并按[阶段 0 测试指南](docs/phase-0-testing.md)配置隐私用途。

公开取帧 API 存在不代表实际俯卧撑计数可靠。当前实验使用前置摄像头仅提取亮度，不拍照、录像、保存或上传画面；需要用户主动授权。Demo 次数仅在内存中保留，未实现训练存储。API 核查与风险见[光学可行性报告](docs/phase-0-feasibility.md)，真机结果填写[阶段 0 验证记录](docs/validation-results.md)。

## 验证与后续

已通过：25 项既有测试、两套工程静态检查、正式工程 13 份 WXML/15 份 WXSS 以及 Demo 的 1 份 WXML/2 份 WXSS 编译。

待验证：开发者工具 GUI 实际运行、手机预览与安全区；光学摄像头精度、系统资源释放和性能仍待 Android/iPhone 实测。本地编译、模拟与真机验证是不同级别。

[完整技术方案](docs/architecture.md) · [阶段 1 交付与文件清单](docs/phase-1.md) · [项目约束](AGENTS.md)

本次停在阶段 1，下一阶段为首页、项目选择和基础训练界面。
