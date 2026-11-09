# 阶段 2：首页、运动项目选择与基础训练界面

日期：2026-11-10（Asia/Hong_Kong）。用户反馈阶段 1“测试无误”，并授权进入阶段 2。该反馈没有提供具体设备与用例，不推断 Android/iPhone 光学实验通过。

## 本次行为

- 首页提供“选择训练项目”入口和四项运动卡片，可直接查看对应项目的训练准备界面。
- 项目列表分为“计次训练”和“计时训练”，由同一份项目配置生成；俯卧撑、仰卧起坐、深蹲用次，平板支撑用秒。
- 训练页展示运动名、当前组/本组目标/累计量/训练用时/休息倒计时等区域。当前没有运行中的训练，数值统一为“—”，目标为“尚未设置”，启动按钮禁用。
- 计次项目展示触屏、手动和光学方式的可用性说明，当前都未开放；平板支撑展示按秒计时，不显示光学方式。
- 无参数、未知 ID、异常类型不会自动变成俯卧撑；显示重新选择与回首页入口。
- 项目选择→训练、更换项目→选择均使用 navigator 的 redirect；首页快速卡片用 navigate，回首页/记录用 switchTab。反复更换不会持续压入页面。

显示内容来自配置与当前路由，没有训练计数、计时器、能力评估、计划算法、历史写入、摄像头、登录、网络、广告或存储。阶段 3 再接入正式触屏和统一计数器，其余能力沿原定阶段推进。

## 文件清单

新增：

- `miniprogram/utils/exercise-view.js`：从项目配置生成展示字段和带 exerciseId 的路由；计次/计时语义统一，非法 ID 返回空状态。
- `tests/pages.test.js`：全部入口到训练页的联通、单位、无效参数、配置隔离和导航回归。
- `docs/phase-2.md`：本阶段交付、边界与验收步骤。

修改：

- `miniprogram/config/exercises.js`：四项目展示描述，保留稳定 ID 和测量单位。
- `miniprogram/config/app.js`、`package.json`：版本升级至 0.2.0，无新增依赖。
- `miniprogram/pages/home/index.js`、`index.wxml`、`index.wxss`：首页、分类标签、运动卡片及入口。
- `miniprogram/pages/exercises/index.js`、`index.json`、`index.wxml`、`index.wxss`：分类项目列表、替换式导航，移除不用的空状态组件注册。
- `miniprogram/pages/training/index.js`、`index.json`、`index.wxml`、`index.wxss`：参数解析、训练准备视图、项目更换和异常入口恢复。
- `miniprogram/styles/common.wxss`：共享计次/计时标签样式。
- `scripts/check.js`：将正式工程的平台能力约束说明更新为阶段 2，继续禁止业务平台服务初始化。
- `AGENTS.md`、`README.md`、`docs/architecture.md`：阶段范围、运行说明与状态。
- `docs/phase-1.md`：记录用户“测试无误”的验收反馈与本次授权。

共新增 3 个文件、修改 20 个既有文件。原有 `project.config.json` 中 AppID/工具设置的用户改动保留，不修改、不纳入本阶段提交。光学 Demo 运行代码保持原样。

## PowerShell 验证

```powershell
Set-Location D:\Codes\WechatPushup
npm.cmd test
npm.cmd run check
npm.cmd run check:wechat
```

需要 Node.js ≥20，没有 npm 依赖，无需安装包。若微信开发者工具位于非默认目录：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-wechat.ps1 -ToolRoot 'C:\Program Files (x86)\Tencent\微信web开发者工具'
```

| 验证 | 结果 | 说明 |
| --- | --- | --- |
| Node.js测试 | 29项通过 | 原25项回归+4项页面/导航检查，不包含原生渲染 |
| 静态检查 | 通过 | 51个JS/JSON；12个正式页、1个Demo页，组件/引用/静态导航/配置一致 |
| 正式模板和样式 | 13份WXML、15份WXSS编译通过 | 本机微信工具内置wcc/wcsc，公共样式一起编译 |
| Demo回归编译 | 1份WXML、2份WXSS通过 | 没有迁入正式工程或修改硬件行为 |
| 阶段1用户验收 | 用户反馈测试无误 | 未提供机型/用例，不扩大验证范围 |
| 阶段2新界面渲染、真机导航与安全区 | 待用户验证 | 不将Node模拟或模板编译称为真机通过 |
| 光学硬件/实际动作效果 | 仍待真机验证 | 不因页面阶段推进自动改变结论 |

本阶段没有新增 wx API。页面导航沿用阶段 1 已核对的[官方 navigator 文档](https://developers.weixin.qq.com/miniprogram/dev/component/navigator.html)及本地 `.audit/phase-1/navigator.html` 副本。

## 开发者工具与手机验收

1. 打开/导入 **`D:\Codes\WechatPushup`**，类型“小程序”，确认根配置指向 `miniprogram/`，使用已有 AppID。无需云开发、npm 构建、服务器或域名配置。
2. 编译首页，检查训练项目入口与四张运动卡片，底部“训练、记录、设置”仍可切换。
3. 分别点击四张卡片；训练准备页的名称必须对应，前三项显示次，平板支撑显示秒且没有触屏/光学方式。此时没有开始训练，数值应为“—”。
4. 首页点击“选择训练项目”，核对计次区3项、计时区1项；选择任一项进入训练准备页。
5. 点击“更换项目”，连续切换多次，确认无页面栈溢出/重复返回；从首页进入时，系统返回应回首页。这是替换选择页后的预期导航行为。
6. 在工具自定义编译条件填写 `pages/training/index`，不填参数，应该显示重新选择入口；再测试参数 `exerciseId=unknown`，同样不默认选中其他项目。合法示例为 `exerciseId=plank`。
7. 训练启动按钮应不可点击，不应有计数增长、计时推进、权限弹窗、虚构目标或训练完成记录。记录/统计等页面仍为准备中。
8. 点击工具“预览”，手机微信扫码。检查窄屏的运动名称、状态标签、按钮，以及 iPhone 底部安全区；页面内容较长时应可正常滚动。阶段2不要求申请相机或登录权限。

可按下面格式反馈；若“测试无误”，下次可明确进入阶段 3：

```text
设备/系统/微信/基础库：
首页与项目列表显示：
四项目名称与次/秒单位：
反复更换项目与系统返回：
无参数/非法参数恢复：
窄屏、滚动与底部安全区：
首条控制台错误（如有）：
```

阶段2交付后，用户明确要求项目选择改为最近使用排序，并直接进入阶段4接入光学与实时调参。当前行为见 [阶段4交付文档](phase-4.md)，本文件保留阶段2历史记录。
