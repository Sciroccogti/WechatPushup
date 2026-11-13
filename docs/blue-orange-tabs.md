# 0.6.3 蓝橙主题与底栏

日期：2026-11-13（Asia/Hong_Kong）。按用户要求改为蓝橙配色、提高底栏文字对比度并明确选中项；仅视觉修订，不推进阶段7。

深蓝 `#142b49` 保持导航/底栏与首页主卡基调；蓝色继续用于图表、链接、辅助控件和训练浅蓝涟漪。主按钮改为深橙 `#bd4618` 配白字；首页重点标题用亮橙 `#ffb36b`，设置选中项用浅橙底/深橙字。

原生tabBar未选文字为白色，选中为亮橙。新增本地原创PNG图标：训练为哑铃，记录为列表，设置为滑杆。未选用白色线条；选中用橙色圆角实底和深蓝图形，形成颜色与形状双重区分。继续使用微信原生tabBar，由框架根据路由选中，不增加自定义导航状态或新API。六张PNG均80×80，不引入图片生成、依赖或外部素材。

按sRGB公式计算：白字/深蓝底约14.27:1，亮橙字/深蓝底约8.10:1，主按钮白字/深橙底约5.18:1。这是配置颜色对比度计算，不代表已完成全套无障碍或真机显示验证。

PowerShell检查：

```powershell
Set-Location D:\Codes\WechatPushup
npm.cmd test
npm.cmd run check
npm.cmd run check:wechat
```

119项测试通过；静态检查增加原生底栏图标文件存在、PNG头与大小校验；微信内置模板/样式编译通过（正式15份WXML/17份WXSS，Demo1份WXML/2份WXSS）。四运动三种入口/四视口48个准备界面近似检查无溢出。底栏三个选中状态在320/390宽度下共6张浏览器近似截图已复核，截图中的底栏按app.json和本地PNG近似绘制。临时脚本 `.audit/settings-layout/blue-orange.js`，截图在同目录。

待微信开发者工具GUI及Android/iPhone复核：原生底栏图标尺寸、安全区、三项切换后的选中显示、字体与屏幕实际对比度。模板编译和浏览器截图不等于原生底栏实测。

变更文件：

```text
AGENTS.md
README.md
docs/blue-orange-tabs.md
docs/validation-results.md
package.json
scripts/check.js
miniprogram/app.json
miniprogram/config/app.js
miniprogram/pages/home/index.wxss
miniprogram/pages/training/index.wxss
miniprogram/styles/common.wxss
miniprogram/styles/optical.wxss
miniprogram/styles/exercise-settings.wxss
miniprogram/assets/tabs/training.png
miniprogram/assets/tabs/training-selected.png
miniprogram/assets/tabs/history.png
miniprogram/assets/tabs/history-selected.png
miniprogram/assets/tabs/settings.png
miniprogram/assets/tabs/settings-selected.png
```
