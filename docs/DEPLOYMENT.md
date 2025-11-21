# 生产环境部署指南

本指南介绍如何在 Linux 服务器上部署 ActivityRuleEditor 项目。

## 架构概览

```
用户请求
    ↓
FastAPI (Gunicorn + Uvicorn) - 统一服务
    ↓
├─→ /api/* → API 接口
├─→ /media/* → 图片资源
└─→ /* → 前端静态文件 (web/dist/)
```

**特点：**
- ✅ 单一服务，无需 Nginx
- ✅ FastAPI 直接提供静态文件
- ✅ 支持 SPA 路由
- ✅ 简化部署流程

## 前置要求

- Linux 服务器（Ubuntu 20.04+ / CentOS 7+）
- Python 3.8+
- Node.js 16+ 和 pnpm
- 域名（可选，用于 HTTPS）

## 1. 服务器准备

### 1.1 安装基础软件

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y python3 python3-pip supervisor git curl

# CentOS/RHEL
sudo yum install -y python3 python3-pip supervisor git curl
```

### 1.2 安装 uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
# 或使用 pip
pip3 install uv
```

### 1.3 安装 Node.js 和 pnpm

```bash
# 安装 Node.js (使用 nvm 推荐)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# 安装 pnpm
npm install -g pnpm
```

## 2. 部署应用

### 2.1 克隆项目

```bash
# 创建应用目录
sudo mkdir -p /opt/activity-rule-editor
sudo chown $USER:$USER /opt/activity-rule-editor

# 克隆项目（或上传项目文件）
cd /opt/activity-rule-editor
git clone <your-repo-url> .
# 或使用 scp/rsync 上传项目文件
```

### 2.2 安装 Python 依赖

```bash
cd /opt/activity-rule-editor
uv sync --extra production
```

这会安装所有依赖，包括 Gunicorn（生产级 WSGI 服务器）。

### 2.3 构建前端

```bash
cd /opt/activity-rule-editor/web

# 设置生产环境 API 地址（留空表示使用相对路径，与后端同域）
export VITE_API_BASE=""

# 构建
pnpm install
pnpm build
```

构建完成后，静态文件会在 `web/dist/` 目录，FastAPI 会自动提供这些文件。

### 2.4 安装 Supervisor

Supervisor 是一个进程管理工具，用于管理应用进程。

```bash
# Ubuntu/Debian
sudo apt install -y supervisor

# CentOS/RHEL
sudo yum install -y supervisor
```

### 2.5 配置 Supervisor

复制配置文件模板：

```bash
sudo cp scripts/supervisor.conf /etc/supervisor/conf.d/activity-rule-editor.conf
```

编辑配置文件，根据实际情况调整：

```bash
sudo nano /etc/supervisor/conf.d/activity-rule-editor.conf
```

**重要配置项：**
- `command`: Gunicorn 启动命令
- `directory`: 项目路径（默认 `/opt/activity-rule-editor`）
- `user`: 运行用户（默认 `www-data`）
- `--bind`: 监听地址和端口（默认 `0.0.0.0:8000`）
  - 如需使用 80 端口，需要 root 权限或配置 `setcap`
  - 或使用防火墙端口转发（推荐）

**使用 80 端口的方法：**

方法 1：使用 setcap（推荐）
```bash
# 给 Python 可执行文件添加权限
sudo setcap 'cap_net_bind_service=+ep' /opt/activity-rule-editor/.venv/bin/python3
```

方法 2：使用 iptables 端口转发
```bash
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8000
```

方法 3：修改 supervisor 配置以 root 运行（不推荐，安全性较低）

### 2.6 创建日志目录

```bash
sudo mkdir -p /var/log/activity-rule-editor
sudo chown www-data:www-data /var/log/activity-rule-editor
```

### 2.7 启动服务

```bash
# 重新加载 supervisor 配置
sudo supervisorctl reread
sudo supervisorctl update

# 启动服务
sudo supervisorctl start activity-rule-editor

# 查看状态
sudo supervisorctl status activity-rule-editor

# 查看日志
sudo supervisorctl tail -f activity-rule-editor
```

**常用 Supervisor 命令：**

```bash
# 启动服务
sudo supervisorctl start activity-rule-editor

# 停止服务
sudo supervisorctl stop activity-rule-editor

# 重启服务
sudo supervisorctl restart activity-rule-editor

# 查看状态
sudo supervisorctl status activity-rule-editor

# 查看日志
sudo supervisorctl tail -f activity-rule-editor

# 查看所有进程
sudo supervisorctl status all
```

## 3. 防火墙配置

```bash
# Ubuntu/Debian (UFW)
sudo ufw allow 8000/tcp
# 如果使用 80 端口
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-port=8000/tcp
# 如果使用 80 端口
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## 4. HTTPS 配置（推荐）

### 4.1 使用 Caddy（推荐，自动 HTTPS）

Caddy 是一个现代化的 Web 服务器，自动处理 HTTPS：

```bash
# 安装 Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

创建 Caddyfile `/etc/caddy/Caddyfile`：

```
your-domain.com {
    reverse_proxy localhost:8000
}
```

启动 Caddy：

```bash
sudo systemctl enable caddy
sudo systemctl start caddy
```

### 4.2 使用 Nginx 作为反向代理（可选）

如果仍想使用 Nginx 作为反向代理和 HTTPS 终端：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        client_max_body_size 50M;
    }
}
```

## 5. 环境变量配置（可选）

如果需要配置环境变量，编辑 supervisor 配置文件：

```bash
sudo nano /etc/supervisor/conf.d/activity-rule-editor.conf
```

在 `[program:activity-rule-editor]` 部分添加或修改 `environment` 行：

```ini
[program:activity-rule-editor]
...
environment=PATH="/opt/activity-rule-editor/.venv/bin:/usr/local/bin:/usr/bin:/bin",VARIABLE_NAME="value",ANOTHER_VAR="another_value"
```

然后重新加载配置：

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl restart activity-rule-editor
```

## 6. 监控和维护

### 6.1 查看服务状态

```bash
# 服务状态
sudo supervisorctl status activity-rule-editor

# 实时日志（supervisor 日志）
sudo supervisorctl tail -f activity-rule-editor

# 查看访问日志
sudo tail -f /var/log/activity-rule-editor/access.log

# 查看错误日志
sudo tail -f /var/log/activity-rule-editor/error.log
```

### 6.2 更新部署

```bash
cd /opt/activity-rule-editor

# 拉取最新代码
git pull  # 或上传新文件

# 更新后端依赖
uv sync --extra production

# 重新构建前端
cd web
pnpm install
pnpm build
cd ..

# 重启服务
sudo supervisorctl restart activity-rule-editor
```

### 6.3 使用部署脚本

项目提供了快速部署脚本：

```bash
cd /opt/activity-rule-editor
./deploy.sh
```

## 7. 性能优化

### 7.1 调整 Gunicorn Workers

根据服务器 CPU 核心数调整 worker 数量：

```ini
# CPU 核心数 * 2 + 1
command=... -w 4 ...
```

编辑 supervisor 配置文件：

```bash
sudo nano /etc/supervisor/conf.d/activity-rule-editor.conf
```

### 7.2 调整超时时间

如果处理大文件，可能需要增加超时时间：

```ini
command=... --timeout 300 ...
```

编辑 supervisor 配置文件：

```bash
sudo nano /etc/supervisor/conf.d/activity-rule-editor.conf
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl restart activity-rule-editor
```

### 7.3 文件上传大小限制

FastAPI 默认没有文件大小限制，但建议在代码中或通过环境变量控制。

## 8. 安全建议

1. **定期更新系统包**
   ```bash
   sudo apt update && sudo apt upgrade
   ```

2. **配置 CORS（如果需要）**
   - 修改 `backend/api/main.py` 中的 CORS 设置，限制允许的源

3. **使用防火墙**
   - 只开放必要的端口

4. **定期备份**
   - 备份项目文件

5. **使用 HTTPS**
   - 生产环境强烈建议使用 HTTPS

## 9. 故障排查

### 服务无法启动

```bash
# 检查服务状态
sudo supervisorctl status activity-rule-editor

# 查看详细日志
sudo supervisorctl tail -f activity-rule-editor

# 查看 supervisor 主日志
sudo tail -f /var/log/supervisor/supervisord.log

# 手动测试启动
cd /opt/activity-rule-editor
uv run gunicorn -w 1 -k uvicorn.workers.UvicornWorker backend.api.main:app --bind 0.0.0.0:8000
```

### 静态文件无法访问

- 检查 `web/dist/` 目录是否存在
- 检查文件权限：`ls -la web/dist/`
- 检查服务日志中的错误信息

### 端口被占用

```bash
# 检查端口占用
sudo netstat -tlnp | grep 8000

# 或使用 ss
sudo ss -tlnp | grep 8000
```

### 前端路由 404

- 确保 FastAPI 的 SPA 路由处理已正确配置
- 检查 `backend/api/main.py` 中的路由顺序（静态文件路由应在 API 路由之后）

## 10. 快速部署检查清单

- [ ] 安装 Python 3.8+ 和 uv
- [ ] 安装 Node.js 和 pnpm
- [ ] 克隆/上传项目到服务器
- [ ] 运行 `uv sync --extra production`
- [ ] 运行 `cd web && pnpm install && pnpm build`
- [ ] 安装 supervisor：`sudo apt install supervisor`
- [ ] 配置 supervisor：`sudo cp scripts/supervisor.conf /etc/supervisor/conf.d/activity-rule-editor.conf`
- [ ] 创建日志目录并设置权限
- [ ] 启动服务：`sudo supervisorctl start activity-rule-editor`
- [ ] 配置防火墙开放端口
- [ ] （可选）配置 HTTPS

## 11. 部署架构对比

### 简化部署（当前方案）

```
用户 → FastAPI (Gunicorn) → 静态文件 + API
```

**优点：**
- 简单，单一服务
- 无需配置 Nginx
- 易于维护

**缺点：**
- 静态文件性能略低于 Nginx
- 需要自己处理 HTTPS（或使用 Caddy）

### 传统部署（可选）

```
用户 → Nginx (HTTPS) → FastAPI (Gunicorn) → API
                ↓
            静态文件
```

**优点：**
- Nginx 静态文件性能更好
- 更好的 HTTPS 支持
- 可以配置缓存

**缺点：**
- 需要配置两个服务
- 配置更复杂
