# 0.5.3：放大运动中操作按钮

日期：2026-11-10（Asia/Hong_Kong）。按用户“大幅增大运动中的按钮”要求调整训练与休息页布局，不推进其他功能。

- 开始/继续训练：整行、至少176rpx高、40rpx字号。训练运行后隐藏已禁用的开始按钮，保留明确的运行状态提示。
- 暂停/结束：各占半行、至少160rpx高、36rpx字号。
- 手动+1、撤销、清零、传感器方式和组操作：至少136rpx高、32rpx字号，增加按钮间距、允许长文案换行。
- 休息页下一组/继续休息：整行、至少176rpx高、40rpx字号；其余操作至少136–144rpx。
- 在375px宽设备上，160/176rpx约为80/88px高；实际视觉和排版需手机预览。按钮放大后页面可能更长，可在操作区滚动。

修改范围限定为训练/休息页样式和主操作布局，保留mark排除误计的事件机制与原有按钮处理函数，不更改存储或训练算法。

## 检查与验收

```powershell
Set-Location D:\Codes\WechatPushup
npm.cmd test
npm.cmd run check
npm.cmd run check:wechat
```

80项既有回归、静态检查与微信内置模板/样式编译通过。未新增仅重复尺寸实现的测试；真机排版/点击手感待用户确认。

微信开发者工具打开`D:\Codes\WechatPushup`，重新编译后生成新预览。检查四项目的开始/暂停/继续/结束，以及手动加减、五组休息和下一组按钮；窄屏文案应正常换行，点按钮不应额外加数。无需清理训练数据。

## 文件清单

- `miniprogram/pages/training/index.wxml`：主操作分行布局，运行时隐藏不可用的开始按钮。
- `miniprogram/pages/training/index.wxss`：训练与休息页的大按钮尺寸、字号和间距。
- `miniprogram/pages/rest/index.wxml`：增加休息页样式作用域。
- `miniprogram/config/app.js`、`package.json`：版本0.5.3。
- `AGENTS.md`、`README.md`：本次范围和入口说明。
- `docs/large-training-buttons.md`：本说明。

已有`project.config.json`中的AppID/开发者工具改动保留，不纳入提交。
