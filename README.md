# Webhook 接收器

零依赖的 Node.js webhook 接收器，专为 Deplexo 免费档（128MB 内存）设计。

## 功能

- `POST` 任意路径 → 记录请求头 + 原始 body，存内存（最近 200 条）+ `/data/webhooks.log`（持久卷）
- `GET /` → 网页看板，实时看收到的 webhook（30 秒自动刷新）
- `GET /health` → Deplexo 健康检查
- 可选 `FORWARD_URL` 环境变量：收到后转发到另一个地址
- 可选 `WEBHOOK_TOKEN` 环境变量：共享密钥，通过 `?token=` 或 `X-Webhook-Token` 请求头校验

## 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| PORT | 监听端口（Deplexo 要求 3000） | 3000 |
| WEBHOOK_TOKEN | 共享密钥，不设则不校验 | 空 |
| FORWARD_URL | 转发目标地址 | 空 |
| MAX_KEEP | 内存保留条数 | 200 |

## 本地运行

```sh
node server.js
# POST http://localhost:3000/hook
```

## 部署到 Deplexo

1. 推到 GitHub 仓库
2. Deplexo 里 Deploy new → 选这个仓库 → Dockerfile 构建
3. 跑起来后会得到 `https://xxx.de.deplexo.com`，webhook 地址填 `https://xxx.de.deplexo.com/hook`
