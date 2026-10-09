# 本地控制 API 与 CDP

应用设置中的「外部控制（本机 API + CDP）」默认关闭。开启后，千面只在 `127.0.0.1` 监听，不接受局域网或公网连接。

## 端口和隔离

- API 端口用于启停实例、跳转页面和查询状态。
- CDP 端口是应用级端口，所有运行中的实例页面会作为独立 target 出现在该端口下。
- 实例自己的 Mihomo 代理端口仍按实例独立分配，和 API/CDP 端口无关。
- API 令牌只保存在本机 `control-api.json`，界面可重新生成。

## 连接步骤

1. 打开「应用设置」并开启外部控制。
2. 复制界面显示的 API 地址、CDP 端口和令牌。
3. 重启千面，让 CDP 端口生效。
4. 请求 `GET /v1/targets`，按 `instanceId` 找到对应页面的 `targetId`。
5. Playwright 使用 `chromium.connectOverCDP('http://127.0.0.1:<CDP端口>')`，再根据 URL/title 或 `targetId` 选择页面。

## API

所有请求都要带 `Authorization: Bearer <令牌>`。

- `GET /v1/status`
- `GET /v1/instances`
- `GET /v1/targets`
- `POST /v1/instances/<实例ID>/start`
- `POST /v1/instances/<实例ID>/stop`
- `POST /v1/instances/<实例ID>/reload`
- `POST /v1/instances/<实例ID>/navigate`，JSON body：`{"url":"https://example.com"}`

API 和 CDP 只用于本机脚本自动化；不要把端口映射到公网，也不要把令牌提交到日志、工单或版本库。
