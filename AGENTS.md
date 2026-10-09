# Facet 项目接手规则

这是千面 Facet 的源码仓库。任何接手本项目的 AI 或自动化代理，在修改代码、控制运行实例或调用本地 API 前，必须先阅读：

1. [AI 与自动化接手说明](docs/AI-CONTROL-HANDOFF.md)
2. [本地控制 API 与 CDP](docs/CONTROL-API.md)
3. [README](README.md)

## 关键约束

- 实际项目根目录由当前工作目录和 Electron 的 `--app-path` 确认，不要猜测旧副本。
- 修改 `src/main/` 后必须重启 Electron 主进程；刷新页面不会重新加载主进程代码。
- API 和 CDP 默认只允许本机回环访问。令牌、Cookie、订阅链接、代理密码和其他凭据不得写入代码、文档、日志、截图或 Git。
- 调用 API 后必须查询实例状态、网页 target 和需要持久化的数据，不能只根据 HTTP 状态码或界面提示判断成功。
- 删除实例、修改网络/DNS、覆盖配置或批量操作前，先做只读盘点并保留可回滚点。
- 代码修改后至少运行 `npm.cmd run check`、`npm.cmd run test:control-api` 和 `git diff --check`；未通过时不得声称完成。
- 文件选择和原生确认框的自动化边界，以接手说明中的限制为准。

## 项目入口

- 主进程：`src/main/main.cjs`
- IPC 分发：`src/main/ipc.cjs`
- 本地控制 API：`src/main/control-api.cjs`
- 控制界面：`src/renderer/`
- 测试：`tests/`
- 专项文档：`docs/`

除非用户明确要求，不要擅自更换技术路线、删除现有数据或把运行凭据写进仓库。

