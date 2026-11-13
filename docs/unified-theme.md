# 0.6.1 统一配色

日期：2026-11-13（Asia/Hong_Kong）。按用户“整体性一致性更强”的要求收敛为蓝色主题，仅视觉修订，不进入阶段7。

| 用途 | 颜色与规则 |
| --- | --- |
| 导航栏、底栏、设置标签底色 | 同一深蓝 `#142b49`；底栏继续与页面背景区分 |
| 主按钮、选中标签、链接、统计值与图表 | 统一 `#245dbe`，主按钮配白字 |
| 深色底栏选中项、光学进度 | 浅亮蓝 `#8fc0ff`，未选项蓝灰 `#bccde3` |
| 页面背景 | 蓝灰白 `#f2f5fa` |
| 卡片 | 白色，边框统一 `#d5dfed` |
| 输入区、次操作、标签 | 蓝灰 `#e8eef7` 与浅蓝 `#e8f0fc`，蓝色文字 |
| 主要/辅助文字 | `#182e49` / `#5d6f87` |
| 训练反馈 | 同一浅蓝色系随机背景，避免连续同色，深色文字 |
| 警告 | 保留原暖色提示，仅表达异常/注意信息 |

同步更新全局样式、空态组件、首页卡片、运动设置、光学滑块/读数、训练动态底色和涟漪、历史详情及统计图表。布局、触区、训练策略、传感器、存储及用户数据不变；没有新API、权限或依赖。原Demo保留。

PowerShell检查：

```powershell
Set-Location D:\Codes\WechatPushup
npm.cmd test
npm.cmd run check
npm.cmd run check:wechat
```

119项测试通过，静态检查通过；微信内置wcc/wcsc编译通过，正式15份WXML/17份WXSS，Demo1份WXML/2份WXSS。复用本机无界面Chrome近似渲染：首页/设置截图复核，四运动三种训练入口与四种视口共48种准备布局无溢出；记录/统计/详情320与390宽度6种检查无页面横向溢出。临时截图位于 `.audit/settings-layout/`、`.audit/records/`。

这些是浏览器排版近似与编译结果；微信原生导航/底栏、真机屏幕颜色、系统字体和安全区仍待开发者工具GUI及Android/iPhone复核。

变更文件：

```text
AGENTS.md
README.md
docs/unified-theme.md
docs/validation-results.md
package.json
miniprogram/app.json
miniprogram/config/app.js
miniprogram/components/empty-state/index.wxss
miniprogram/pages/home/index.wxss
miniprogram/pages/history/index.wxss
miniprogram/pages/record-detail/index.wxss
miniprogram/pages/statistics/index.wxss
miniprogram/pages/training/index.wxss
miniprogram/services/training-page.js
miniprogram/styles/common.wxss
miniprogram/styles/exercise-settings.wxss
miniprogram/styles/optical.wxss
miniprogram/templates/optical-settings.wxml
miniprogram/utils/touch-feedback.js
```

`project.config.json` 既有用户改动保留，不纳入提交。
