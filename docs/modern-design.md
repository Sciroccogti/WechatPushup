# 0.6.2 统一现代视觉

日期：2026-11-13（Asia/Hong_Kong）。用户授权改进一致性和现代感；只修订阶段6的视图与样式，不进入阶段7，不更改训练、传感器与存储逻辑。

## 视觉规则

- 保留统一蓝色主题、独立深色底栏与浅色页面。
- 页面左右/顶部留白以32rpx为基准，卡片/内容弹层使用28rpx圆角，输入/按钮/筛选器使用20rpx圆角。训练中的大按钮尺寸按既有要求保留。
- 卡片统一白底、浅边框与轻阴影，内容用留白和细分隔线区分，减少粗重色块与装饰边。
- 页标题44rpx、段落标题30rpx、辅助文字23–26rpx；计划/评估/方式/总结/休息页采用小号用途标签加运动名称主标题。
- 数据采用等宽数字；大数值使用深色文字，蓝色主要表达操作和图形，避免整页处处强调。
- 共用工具按钮提升到88rpx触区，使用明确行高；训练页仍使用原136/160/176rpx大操作尺寸，短屏开始按钮160rpx。

## 页面

首页改为深蓝渐变训练主卡、简洁项目卡片和训练足迹入口。主卡是纯WXSS，不使用图片或外部资源；保留排序、项目路由和真实累计时长，未添加示例成绩。去除项目卡片顶部粗线，统一轻边框、标签和方向提示，合并冗余单位信息。

设置的四运动标签改为浅底分段式，当前项为白底蓝字；实时信号区、参数卡片、滑块数值、按钮和状态分隔更一致。保持主动开硬件与调参事件。

历史页筛选器与全局输入统一，日期分组弱化、记录总量突出；详情和统计采用相同数字层级、卡片与细线。图表保持内部横滑。训练准备界面使用实色白卡及主/次操作，保留一屏布局、mark隔离、大触区和大号开始按钮。

## 验证

PowerShell：

```powershell
Set-Location D:\Codes\WechatPushup
npm.cmd test
npm.cmd run check
npm.cmd run check:wechat
```

119项测试、静态检查通过；本机微信wcc/wcsc编译通过，正式15份WXML/17份WXSS，Demo1份WXML/2份WXSS。新增修改不需要新API、依赖或权限，也没有数据迁移。

本机无界面Chrome近似渲染并复核首页、设置、训练、统计截图；48种准备界面（四运动×三目的×四视口，最小320×400）未溢出，记录/统计/详情在320与390宽度的6种组合无页面横向溢出。临时截图沿用 `.audit/settings-layout/` 与 `.audit/records/`，仅使用合成训练数据。

尚未运行微信开发者工具GUI和Android/iPhone原生页面。需复核原生字体/输入/按钮、分段标签、卡片阴影、安全区、窄屏与大字号，以及原有开始点击响应。浏览器近似排版、软件事件测试和模板编译均不代表真机通过。

## 文件清单

```text
AGENTS.md
README.md
docs/modern-design.md
docs/validation-results.md
package.json
miniprogram/config/app.js
miniprogram/styles/common.wxss
miniprogram/styles/optical.wxss
miniprogram/styles/exercise-settings.wxss
miniprogram/components/empty-state/index.wxss
miniprogram/pages/home/index.wxml
miniprogram/pages/home/index.wxss
miniprogram/pages/training/index.wxss
miniprogram/pages/history/index.wxss
miniprogram/pages/statistics/index.wxss
miniprogram/pages/record-detail/index.wxss
miniprogram/pages/plan/index.wxml
miniprogram/pages/assessment/index.wxml
miniprogram/pages/count-mode/index.wxml
miniprogram/pages/count-mode/index.wxss
miniprogram/pages/summary/index.wxml
miniprogram/pages/rest/index.wxml
```

用户已有 `project.config.json` 改动保留，不纳入本地提交。
