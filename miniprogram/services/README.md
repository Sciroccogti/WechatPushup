# 数据与平台服务边界

当前服务：

- storage/local-document.js：注入wx的版本化本地文档适配器，所有本地读写统一入口，校验失败/未来版本不覆盖。
- preferences.js：光学、深蹲陀螺仪、仰卧起坐融合参数、最近使用、排序方式及累计训练时长，兼容旧schema1/2/3到4；更新前重读避免覆盖其他页面的新数据。排序只在首页/执行训练页显示。
- camera-capabilities.js：公开相机能力与基础库检查，工具环境启用模拟/触屏路径。
- optical-page.js：页面级相机授权、原始帧抽样、测试/训练回调、即时调参与生命周期清理。camera 在页面模板中，使用无参数 createCameraContext。
- optical-settings-page.js：设置/校准共用页面工厂，调参逻辑只有一个实现。
- gyro-source.js：公开陀螺仪生命周期，固定监听函数移除、启动/静默超时、全局单一owner与过期回调防护。
- situp-source.js：加速度主导与陀螺仪辅助的单一motion来源；主失败降级触屏、辅失败提示仅用加速度。两种监听共同释放，各自启动/静默超时与旧回调失效；通过movement-owner.js与深蹲互斥。
- training-page.js：训练/休息共用页面控制器，连接领域会话与计数来源、计时、后台暂停和累计时长保存。
- session-runtime.js：单一当前会话，只存在内存；页面redirect传稳定sessionId，禁止并行开始两次训练。
- training-store.js：能力/长期进展与训练结果，结果ID幂等保存，不自动删除旧记录；历史界面和统计仍在阶段6。

完整训练数据能力仍在阶段 6 开发：

- repositories/：计划、训练记录与设置的读写入口。
- storage/：StorageAdapter、LocalStorageAdapter、版本迁移、导入/导出契约。
- 未来备份通过独立适配器扩展，不在页面和领域层调用网络。

不创建云备份空实现、服务器地址、密钥或后台请求；帧、加速度与陀螺仪原始数据不持久化。
实现时在适配器中注入 wx，处理损坏、容量不足与迁移失败，禁止静默清空。
