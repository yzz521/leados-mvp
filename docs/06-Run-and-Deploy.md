# 06 — 运行、配置与部署

## 1. 本地开发运行

### 环境

JDK 21。确认：

```bash
java -version
javac -version
```

### macOS / Linux

```bash
./scripts/run.sh
```

### Windows

```bat
scripts\run.bat
```

运行脚本会重新编译 Java 源码，复制静态资源，再启动 HTTP 服务。

## 2. 环境变量

| 变量 | 默认值 | 用途 |
|---|---|---|
| `PORT` | `8080` | HTTP 服务监听端口 |
| `LEADOS_DATA_DIR` | `./data` | JSON 数据目录 |

示例：

```bash
PORT=8088 LEADOS_DATA_DIR=/var/lib/leados ./scripts/run.sh
```

## 3. 数据备份

运行过程中不建议直接复制正在写入的 JSON 文件。推荐：

1. 停止服务。
2. 复制整个 `data` 目录到备份位置。
3. 重新启动服务。

恢复时停止服务，将备份文件放回数据目录。

## 4. 本地测试

在服务运行状态下：

```bash
python3 scripts/smoke-test.py
```

脚本会创建一条测试线索、执行分析、验证任务接口。测试数据会写入当前数据文件；建议在临时数据目录或重置后的演示数据上运行。

## 5. 网络和生产部署

当前应用默认只监听 `127.0.0.1`（本机回环地址），但没有身份认证、TLS 和速率限制。不要直接暴露在公网，也不要放在可被非可信网络访问的服务器上。

生产部署建议：

- Spring Boot 3.5 / Java 21 可执行 JAR。
- PostgreSQL 主业务库与定期备份。
- Redis 用于缓存、分布式限流和异步任务辅助。
- 对象存储保存导入文件和客户授权材料。
- Nginx / 云负载均衡终止 TLS。
- 通过 Secret Manager 管理数据库密码和模型密钥。
- 健康检查、结构化日志、指标监控、错误告警。
- DB migration（Flyway 或 Liquibase）管理版本。
- 定义 RPO/RTO、备份恢复演练和数据删除流程。

## 6. 版本升级

当前版本没有数据库迁移机制。升级时：

1. 备份 `data/leados.json`。
2. 替换源码。
3. 重新运行脚本。
4. 如数据结构发生变化，必须先实现兼容迁移，不要手工假定字段可直接删除。

## 7. 故障排查

| 现象 | 检查项 |
|---|---|
| `javac: command not found` | 安装 JDK 21 并配置 PATH |
| 端口被占用 | 设置其他 `PORT` |
| 页面能打开但 API 失败 | 检查终端日志和 `/api/health` |
| 中文乱码 | 确认 CSV 使用 UTF-8 |
| 导入重复 | 当前按同一业务线中的邮箱/电话精确归一化判断 |
| 数据没有保留 | 检查 `LEADOS_DATA_DIR` 是否指向预期目录及文件权限 |
| JSON 文件损坏 | 停止服务并从备份恢复；当前 MVP 不提供自动修复工具 |
