# ClawParty 部署指南（Caddy + Sync Server）

## 架构概览

```
客户端浏览器 (wss://sync.clawparty.com)
       │
       ▼
┌──────────────────────────┐
│  Caddy (反向代理)         │
│  • 自动 TLS 证书          │  ← 端口 443 (HTTPS/WSS)
│  • Let's Encrypt 自动续期 │  ← 端口 80  (HTTP → 重定向)
│  • WebSocket 代理转发     │
└──────────┬───────────────┘
           │ ws://localhost:18080
           ▼
┌──────────────────────────┐
│  Sync Server             │
│  • 仅监听 localhost      │  ← 端口 18080 (WS, 无 TLS)
│  • 不需要证书文件         │
│  • 心跳自动广播到 Nostr   │
└──────────────────────────┘
```

## 前置条件

- 一台有**公网 IP** 的 Linux 服务器（Ubuntu 20.04+ 推荐）
- 域名 `clawparty.com` 和 `sync.clawparty.com` 的 DNS 已指向服务器 IP
- 端口 **80** 和 **443** 对外开放

## 第一步：安装 Caddy

```bash
# Ubuntu / Debian
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

验证安装：

```bash
caddy version
```

## 第二步：配置 DNS

在你的域名管理面板添加 A 记录：

| 类型 | 名称 | 值 |
|------|------|-----|
| A | `clawparty.com` | `你的服务器IP` |
| A | `www` | `你的服务器IP` |
| A | `sync` | `你的服务器IP` |

> DNS 生效可能需要几分钟到几小时。可用 `dig sync.clawparty.com` 验证。

## 第三步：部署 Caddyfile

```bash
# 复制 Caddyfile 到 Caddy 配置目录
sudo cp installation/Caddyfile /etc/caddy/Caddyfile

# 验证配置语法
caddy validate --config /etc/caddy/Caddyfile

# 重启 Caddy 使配置生效
sudo systemctl restart caddy
```

Caddy 会自动：
- 申请 Let's Encrypt TLS 证书
- 配置 HTTPS（443 端口）
- HTTP 自动重定向到 HTTPS
- 证书到期前自动续期

## 第四步：部署前端

```bash
# 构建前端
npm run build

# 复制构建产物到 Caddy 静态文件目录
sudo mkdir -p /var/www/clawparty.com
sudo cp -r dist/* /var/www/clawparty.com/
```

## 第五步：启动 Sync Server

### 环境变量

使用 Caddy 后，只需要设置以下变量（**不再需要** `TLS_CERT` / `TLS_KEY`）：

| 变量 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `SYNC_URL` | **是** | 公网 WSS 地址（Caddy 代理的域名） | `wss://sync.clawparty.com` |
| `NOSTR_SECRET_KEY` | **是** | Nostr 签名密钥（hex 或 nsec） | `nsec1...` 或 64 位 hex |
| `PORT` | 否 | 监听端口，默认 `18080` | `18080` |
| `HOST` | 否 | 绑定地址，建议 `127.0.0.1` | `127.0.0.1` |
| `SERVED_MAPS` | 否 | 服务的地图，默认 `all` | `all` / `auto` / `0-99` |
| `NODE_REGION` | 否 | 节点区域标识 | `asia-east` |
| `MAX_PLAYERS` | 否 | 最大玩家数，默认 `200` | `200` |

### 启动命令

```bash
cd server

# 安装依赖
npm install

# 构建
npm run build

# 启动（生产环境）
SYNC_URL=wss://sync.clawparty.com \
NOSTR_SECRET_KEY=your-secret-key-here \
HOST=127.0.0.1 \
npm start
```

> **安全提示**：设置 `HOST=127.0.0.1` 使 sync server 只监听本地，外部流量必须通过 Caddy 代理。这样端口 18080 不会直接暴露到公网。

### 使用 systemd 守护进程（推荐）

创建 `/etc/systemd/system/clawparty-sync.service`：

```ini
[Unit]
Description=ClawParty Sync Server
After=network.target caddy.service

[Service]
Type=simple
User=clawparty
WorkingDirectory=/opt/clawparty/server
Environment=SYNC_URL=wss://sync.clawparty.com
Environment=NOSTR_SECRET_KEY=your-secret-key-here
Environment=HOST=127.0.0.1
Environment=PORT=18080
Environment=NODE_REGION=asia-east
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable clawparty-sync
sudo systemctl start clawparty-sync

# 查看日志
sudo journalctl -u clawparty-sync -f
```

## 验证部署

### 1. 检查 Caddy 状态

```bash
sudo systemctl status caddy
```

### 2. 检查 TLS 证书

```bash
curl -I https://sync.clawparty.com
# 应该返回 HTTP/2 状态码，没有证书错误
```

### 3. 测试 WebSocket 连接

```bash
# 安装 wscat（如果没有）
npm install -g wscat

# 测试 WSS 连接
wscat -c wss://sync.clawparty.com
```

### 4. 检查心跳广播

sync server 启动后日志应显示：

```
[Guardian] Starting heartbeat publisher
[Guardian]   Sync:   wss://sync.clawparty.com
[Guardian] Heartbeat online: 4/4 connected (4 total), 0 players, 0 active rooms
```

## 常见问题

### 证书申请失败

- 确认端口 80 和 443 已开放：`sudo ufw allow 80,443`
- 确认 DNS 已生效：`dig sync.clawparty.com`
- 查看 Caddy 日志：`sudo journalctl -u caddy -f`

### WebSocket 连接超时

- 检查 sync server 是否在运行：`curl http://localhost:18080`
- 检查端口是否监听：`ss -tlnp | grep 18080`

### 多个 Sync Server 节点

每个 sync server 节点需要自己的域名和 Caddy 实例。例如：

- `sync-1.clawparty.com` → 节点 1
- `sync-2.clawparty.com` → 节点 2

客户端通过 Nostr 心跳事件自动发现所有在线节点，无需手动配置。
