# 数据与平台服务边界

当前服务：

- preferences.js：最近使用及光学参数的独立版本化本地存储，注入 wx 接口，读写失败或未知版本不覆盖原数据。没有训练记录持久化。
- camera-capabilities.js：公开相机能力与基础库检查，工具环境启用模拟/触屏路径。
- optical-page.js：页面级相机授权、原始帧抽样、测试/训练回调、即时调参与生命周期清理。camera 在页面模板中，使用无参数 createCameraContext。
- optical-settings-page.js：设置/校准共用页面工厂，调参逻辑只有一个实现。

完整训练数据能力仍在阶段 6 开发：

- repositories/：计划、训练记录与设置的读写入口。
- storage/：StorageAdapter、LocalStorageAdapter、版本迁移、导入/导出契约。
- 未来备份通过独立适配器扩展，不在页面和领域层调用网络。

偏好之外不初始化业务数据存储，不创建云备份空实现、服务器地址、密钥或后台请求。
实现时在适配器中注入 wx，处理损坏、容量不足与迁移失败，禁止静默清空。
