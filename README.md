# 随身健身教练

微信原生小程序，使用 WXML、WXSS、JavaScript 和 JSON。本地优先、无需登录或后端，按阶段开发。

**当前已完成阶段 2：首页、运动项目选择与基础训练准备界面。** 用户已反馈阶段 1 测试无误。正式工程可查看四种运动的训练准备界面，计次/计时单位明确；实际计数、计时、计划和存储将在后续阶段实现。阶段 0 光学实验单独保留，硬件与实际动作效果仍待真机验证。

## 快速检查

需要 Node.js 20 或更新版本；无依赖，不必 npm install。PowerShell：

```powershell
Set-Location D:\Codes\WechatPushup
npm.cmd test
npm.cmd run check
npm.cmd run check:wechat
```

- `test`：29 项测试，涵盖既有光学/触屏/生命周期回归，以及运动页面入口、单位、异常参数和导航。
- `check`：两套工程的 JS/JSON、页面/组件、静态导航、模块引用、运动配置与阶段边界。
- `check:wechat`：调用本机微信开发者工具内置 wcc/wcsc，编译全部模板与样式；产物写到忽略目录 `.audit/`。工具安装在其他目录时，参见[阶段 2 指南](docs/phase-2.md)。

`npm.cmd` 避免 Windows 对 npm.ps1 的执行策略限制，无需更改系统执行策略。

## 导入正式工程

1. 微信开发者工具导入 **`D:\Codes\WechatPushup`**，类型选择“小程序”，不启用云开发。
2. 根 `project.config.json` 指向 **`miniprogram/`**，现有 AppID 和工具设置已保留。使用稳定基础库，建议沿用 ≥2.32.3。
3. 点击编译，默认显示首页，底部有“训练、记录、设置”。首页可通过四项运动卡片直接打开对应训练准备界面。若旧窗口仍显示光学实验，关闭后重新导入仓库根目录。
4. 点击“选择训练项目”查看计次/计时分类列表，选择项目进入训练准备界面。“更换项目”可回到选择页；缺失/非法项目参数会显示重新选择入口。训练数值暂显示“—”，启动按钮禁用，尚未实际计数/计时。其他计划、历史、统计页面仍为准备中。
5. 点击预览，使用具有该 AppID 开发权限的微信扫码；检查页面跳转、窄屏和底部安全区。本阶段不会申请登录或相机权限。

完整文件清单、编译条件、检查结果与导入说明见[阶段 2 交付文档](docs/phase-2.md)。

## 目录

```text
AGENTS.md                         阶段边界与开发约束
project.config.json               默认正式工程入口
package.json                      零依赖检查命令
miniprogram/
  app.js / app.json / app.wxss     原生应用壳、页面注册和全局样式
  sitemap.json                    开发阶段搜索索引配置
  config/                         应用信息、四种运动的稳定ID/类型/单位
  utils/exercise-view.js          配置到运动卡片、训练字段与路由的转换
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

四种运动为俯卧撑、仰卧起坐、深蹲（次）及平板支撑（秒），首页、项目列表和训练页共用同一配置。训练准备页区分计次/计时，平板支撑不显示光学选项；所有未实现能力明确标为准备中，不显示虚构训练目标或历史数据。

## 继续使用光学 Demo

另行导入 **`D:\Codes\WechatPushup\experiments\optical-demo`**，使用实验目录自己的 `project.config.json`；初始为游客 AppID，真机预览前在该实验工程填写自己的 AppID，并按[阶段 0 测试指南](docs/phase-0-testing.md)配置隐私用途。

公开取帧 API 存在不代表实际俯卧撑计数可靠。当前实验使用前置摄像头仅提取亮度，不拍照、录像、保存或上传画面；需要用户主动授权。Demo 次数仅在内存中保留，未实现训练存储。API 核查与风险见[光学可行性报告](docs/phase-0-feasibility.md)，真机结果填写[阶段 0 验证记录](docs/validation-results.md)。

## 验证与后续

已通过：29 项测试、两套工程静态检查、正式工程 13 份 WXML/15 份 WXSS 以及 Demo 的 1 份 WXML/2 份 WXSS 编译。

用户已反馈阶段 1 测试无误（未指定设备/用例）。阶段 2 新界面的 GUI 运行、手机预览与安全区待用户验证；光学精度、系统资源释放和性能仍待 Android/iPhone 实测。本地编译、模拟与真机验证是不同级别。

[完整技术方案](docs/architecture.md) · [阶段 2 交付与文件清单](docs/phase-2.md) · [阶段 1 记录](docs/phase-1.md) · [项目约束](AGENTS.md)

本次停在阶段 2，下一阶段为正式统一计数器与触屏计数。
