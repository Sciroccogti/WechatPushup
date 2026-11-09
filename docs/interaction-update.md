# 0.5.1：训练页选择、并行输入与大面积触屏

日期：2026-11-10（Asia/Hong_Kong）。按用户本次要求修订阶段5交互，不推进阶段6的历史统计与导入导出。

后续0.5.2修订：用户反馈开始按钮无响应及平板需二次触碰，现将控件事件隔离改为mark标记、停止闲置刷新、精简setData并缩小涟漪原始图层；详见[开始按钮修复记录](training-start-fix.md)。以下验收数字保留0.5.1交付时的记录。

## 本次行为

- 运动项目弃用01–04编号，只以名称和稳定ID识别；五组训练中的组数仍正常显示。
- 删除独立的`pages/exercises/`四个文件及其注册项，正式工程现有11个页面。所有选择入口合并到底部“训练”页（`pages/home/`）；在此直接看四个项目卡片和切换排序。
- 执行训练的`pages/training/`也可切换“累计训练时长/最近使用”，排序后仍保持当前项目选中，不按位置误切项目。运行或校准中项目选择禁用；暂停后可原地更换，先结束并保存旧训练再redirect到新项目自由训练，避免并行会话。
- 无项目参数进入执行页时，直接用页顶项目picker选择，不再跳独立选择页；原计划、能力评估和五组流程继续保留。

## 传感器与触屏并行

俯卧撑保留光学，仰卧起坐/深蹲保留胸前陀螺仪。三个运动在传感器运行并完成校准后，都可同时触屏补数，不必先关闭传感器。

- 一次只运行一个主要传感器；触屏是并行补充来源。触屏长按只记一次，多点需全部松开后解锁，触屏最小间隔仍为600ms。
- 传感器与触屏跨来源事件600ms内合并；手动“+1”为用户显式修正，不受自动去重窗口影响。
- 若已经进入光学遮挡候选/DARK/LIGHT，或陀螺仪OUT/BACK，用户触屏已计入一次，则该传感器周期随后完成时不再加一，即使恢复事件距触屏超过600ms。
- 同种传感器仍使用自身状态机的冷却和完整周期规则；所有实际接受的来源记录到本次结果中。校准中、暂停、休息和后台不接受触屏加数。

这是可模拟验证的去重策略，不能完美判断两个不同来源是否来自同一个真实动作。实测若用户在同一动作中相隔较久、且触屏发生于传感器尚未发现候选之前，仍可能需要调整策略或手动撤销；不把软件测试等同于真实动作准确性。

## 大触区与视觉反馈

- 执行页将根内容与空白设为触摸接收区，主要数字/触摸展示区运行时至少占60vh，其余非控件空白同样可触发。大数字、目标和活动时长保持可见。
- 控件区（开始、暂停、结束、加减、排序、项目picker、相机小窗、隐私弹窗）在0.5.2改用mark标记，根触摸处理器排除标记事件，不再拦截按钮的原生触摸链；按控件不会额外触发大区域计数。滑动主要区域不滚动，控件区仍可滚动检查设置。
- 每次有效计次触碰在`clientX/clientY`落点生成绿色系圆形涟漪，扩散覆盖页面内容背景，随后保持新颜色，同时显示短暂“+1”。颜色从同一绿色系固定调色板随机选取，避免连续同色，保证深色文字对比度。
- 平板支撑在尚未开始/暂停时，轻触大区域开始/继续计时；运行中触屏仅显示涟漪与“计时中”，不暂停、不重置、不增加秒数。按开始按钮也保留触摸落点反馈。
- 使用固定定位背景/效果容器，动画层`pointer-events:none`，不遮挡按钮和触摸。0.5.2改为12vmax小圆放大到26倍，并在视口裁剪，避免300vmax原始大图层。涟漪约560ms扩散，标签与节点约720ms清理。新触碰只保留最新动画，避免无限堆积节点；后台/卸载清理定时器，返回不重播旧动画。
- 运行中光学面板缩成小型真实预览与信号状态，保持camera节点连续采集，留出大触区；暂停/校准显示完整面板。没有隐藏采集或在动画中重新挂载相机。
- 系统原生导航栏和系统区域不属于小程序触摸区，也不随页面涟漪变色。Android/iPhone的CSS层叠、原生camera与滚动效果仍需真机确认。

原生事件实现参考[微信事件处理文档](https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxml/event.html)、[触摸事件与坐标](https://developers.weixin.qq.com/miniprogram/dev/framework/view/tap)、[事件对象](https://developers.weixin.qq.com/miniprogram/dev/framework/component-framework/event-object)；本次只读副本在`.audit/interaction/`。优先使用触点`clientX/clientY`作为视口落点，开始计时按钮保留touchstart坐标，不用可能包含滚动偏移的tap detail计算位置。没有新增硬件API或依赖。

## 验证

```powershell
Set-Location D:\Codes\WechatPushup
npm.cmd test
npm.cmd run check
npm.cmd run check:wechat
```

| 检查 | 本次结果 | 限制 |
| --- | --- | --- |
| Node.js测试 | 76项通过 | 新增并行输入/周期去重、落点/配色、动画生命周期、平板触屏、就地换项/排序、控件冒泡隔离，原训练/存储回归通过 |
| 静态检查 | 通过 | 正式11页+Demo1页；旧选择路由已移除，模块/事件/导航合法 |
| 本机微信编译器 | 正式14WXML/15WXSS，Demo1WXML/2WXSS通过 | 不等于GUI渲染和CSS实际帧率测试 |
| 真机视觉/触区/相机层级、传感器实际计数 | 待真机验证 | 没有连接Android/iPhone设备，不以模拟结果宣称硬件通过 |

本次存储格式保持不变，不修改已有AppID或开发者工具本地配置。

## 微信工具与手机验收

1. 打开/导入`D:\Codes\WechatPushup`，根目录指向`miniprogram/`，使用已有AppID和稳定基础库。编译后底部“训练”页直接显示四项目，没有编号或单独选择页；该页切换排序应立即生效，设置页也读到相同选择。
2. 进入任一计次项目的自由训练，开始后触碰屏幕中心、边角、数字和空白。计数应+1，落点出现涟漪/标签，页面背景变成同色系随机颜色；按住不连加，600ms内重复触碰应被忽略且不显示成功+1。
3. 在俯卧撑开启光学并校准后，既做明暗周期也触屏。触屏不停止相机；同周期或相近来源不应重复加数。仰卧起坐/深蹲胸前固定手机后同样测试陀螺仪+触屏；真实计数准确性单独记录。
4. 开始/暂停/结束、撤销/清零、排序、项目picker和相机控件不应因为触摸冒泡而额外加次数。暂停/校准/休息触屏不计数。
5. 平板支撑可轻触大区域开始计时；运行时多次触屏只做动效，秒数连续正常推进；暂停后轻触可继续，不清零。
6. 执行页排序变化不应改变当前项目；运行中先暂停，再从页顶更换运动，旧结果应保存，新项目进入自由训练，不另开选择页，不堆积页面栈。保存失败会提示并保留当前页面。
7. 检查五组达目标转休息、暂停后提前完成/跳过、调目标、总结仍正常。进入后台或关闭页面时，硬件与动画定时器停止，返回不闪旧动画。
8. Android/iPhone分别检查窄屏、底部安全区、涟漪落点（尤其滚动后）、光学原生小窗层级、颜色/文字对比和响应速度。请反馈机型、微信/基础库、具体动作与误计情况。

## 文件清单

新增 3 个文件、修改 26 个文件，按用户要求删除独立选择页的 4 个文件；原有 `project.config.json` 用户改动保留，不纳入提交。

```text
新增 docs/interaction-update.md
新增 miniprogram/utils/touch-feedback.js
新增 tests/touch-interaction.test.js
修改 AGENTS.md
修改 README.md
修改 docs/architecture.md
修改 docs/phase-5.md
修改 miniprogram/app.json
修改 miniprogram/config/app.js
修改 miniprogram/domain/README.md
修改 miniprogram/domain/counter/manager.js
修改 miniprogram/pages/home/index.js
修改 miniprogram/pages/home/index.json
修改 miniprogram/pages/home/index.wxml
修改 miniprogram/pages/home/index.wxss
修改 miniprogram/pages/training/index.json
修改 miniprogram/pages/training/index.wxml
修改 miniprogram/pages/training/index.wxss
修改 miniprogram/services/training-page.js
修改 miniprogram/styles/optical.wxss
修改 miniprogram/templates/optical.wxml
修改 miniprogram/utils/exercise-view.js
修改 package.json
修改 scripts/check.js
修改 tests/optical-integration.test.js
修改 tests/pages.test.js
修改 tests/preferences.test.js
修改 tests/production-optical.test.js
修改 tests/training.test.js
删除 miniprogram/pages/exercises/index.js
删除 miniprogram/pages/exercises/index.json
删除 miniprogram/pages/exercises/index.wxml
删除 miniprogram/pages/exercises/index.wxss
```
