# 0.5.2：开始按钮与闲置刷新修复

日期：2026-11-10（Asia/Hong_Kong）。用户反馈：平板支撑点击开始后卡住，再触碰其他位置才运行；其他计次项目点击开始没有反应。本次只修复交互响应与刷新，不进入阶段6。

## 排查与修改

确认的原有代码问题：

- 开始/暂停/结束等控件的祖先节点统一注册`catchtouchstart/catchtouchend/catchtouchcancel`，用于防止大区域误计；同时按钮依赖独立的`bindtap`。旧回归只直接调用`startCounting()`，没有检查WXML祖先事件与完整触摸顺序。这种拦截边界没有被充分验证。
- 未开始/暂停/准备阶段也有250ms训练刷新定时器，每次提交完整phase/count/groupRows等字段，哪怕内容没变。实际设备上的无谓刷新可能加重交互卡顿。
- 平板启动立即播放涟漪，原涟漪基础尺寸为300vmax，存在不必要的大图层合成负担。
- 开始后按钮只被禁用，文字仍是“开始训练”，且主状态可能在上方，用户缺少就近的启动确认。

本次修复：

1. 控件包装节点改为`mark:control="{{true}}"`，仅用普通`bindtouchstart`记录坐标；根触摸处理器检查`event.mark.control`后忽略控件计数。取消控件祖先对touchend等事件的catch拦截，按钮保留原生触摸/点击链。touchend继续到根节点释放手指锁。
2. 训练刷新仅在working或rest运行；未开始、暂停、校准待机和ready无无意义轮询。每次同步比较数据，只将变化字段传给setData，不再四次/秒重传相同组数组和按钮状态。
3. 涟漪改用12vmax小圆，在固定视口容器内transform放大到26倍，保留整页同色系扩散和落点标签，不创建300vmax原始圆图层。效果容器裁剪、禁止命中触摸。
4. 按钮启动后明确显示“计数中/计时中”，附近文字说明已经开始或正在校准；不需要再触碰屏幕来启动计时。

这些修改针对代码中已确认的事件/刷新风险。**没有连接用户真机复现，因此不能断言某个微信版本上原生tap无响应的唯一原因已经得到设备级证明。** 最终点击响应和卡顿改善仍需重新预览确认。

事件mark沿祖先合并且不阻止传播的规则来自[官方事件对象文档](https://developers.weixin.qq.com/miniprogram/dev/framework/component-framework/event-object)，本机副本为`.audit/interaction/object.html`。mark最低基础库2.7.1，低于当前项目使用的≥2.32.3要求；没有新增wx API或权限。

## 验证

```powershell
Set-Location D:\Codes\WechatPushup
npm.cmd test
npm.cmd run check
npm.cmd run check:wechat
```

- 80项Node.js测试通过。新增测试读取真实WXML按钮、祖先绑定、disabled与mark，并模拟`touchstart → touchend → tap`：四项运动单击进入working，平板无需二次触屏持续计时；暂停/继续按钮不误加数；光学/陀螺仪先校准再进入训练。
- 新增待机/暂停零轮询、工作时只提交变化字段的检查；原大触区、混合去重、完整五组、计时、存储与资源释放回归通过。
- 静态检查通过；本机微信内置编译器正式14WXML/15WXSS、Demo1WXML/2WXSS通过。
- WXML测试模拟的是事件传播与页面逻辑，**不模拟微信原生tap合成或真实渲染**，不能用它声称真机交互已通过。

## 用户复测

1. 微信开发者工具重新编译仓库根项目，确认版本0.5.2；重新点击预览并扫码，打开新的预览代码。无需删除本地存储或重置训练数据。
2. 俯卧撑、仰卧起坐、深蹲先选触屏，在自由训练页单击“开始训练”。应立即显示“计数中”和启动提示；再触大区域应计一次，按开始本身不多计。
3. 平板支撑单击开始后不再触碰屏幕，观察1–2秒，应自动显示持续增长的秒数。暂停后等待应保持不动，单击继续后自行增长。
4. 再检查传感器模式：俯卧撑相机授权/校准状态可见；仰卧起坐/深蹲陀螺仪先静止校准。校准不应被误认为计数卡死；失败应提示并降级触屏。
5. 检查涟漪扩散是否流畅、按钮能否直接暂停/结束、控件操作是否误加次数，后台/返回是否仍正确暂停。

若仍异常，请记录运动项目、页面显示的阶段文字、设备/微信版本和开发者工具首条报错；不清除现有训练数据来掩盖问题。

## 文件清单

新增 3 个文件、修改 12 个文件。原有`project.config.json`中的AppID/工具配置改动保留，不纳入提交。

```text
新增 docs/training-start-fix.md
新增 tests/helpers/wxml-events.js
新增 tests/start-button.test.js
修改 AGENTS.md
修改 README.md
修改 docs/architecture.md
修改 docs/interaction-update.md
修改 miniprogram/config/app.js
修改 miniprogram/pages/training/index.wxml
修改 miniprogram/pages/training/index.wxss
修改 miniprogram/services/training-page.js
修改 package.json
修改 tests/helpers/runtime.js
修改 tests/optical-integration.test.js
修改 tests/touch-interaction.test.js
```
