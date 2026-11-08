# dsh-webdav-sync

[![DSH Plugin](https://img.shields.io/badge/DSH-plugin-blue)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

DSH（DeepSeek Harness）跨设备同步插件：把 DSH 的**设置与状态**同步到 WebDAV（坚果云、Nextcloud 等），**按系统分开存**，并用「参照」语义拉取——远端只是参考，不强制覆盖本机。

> 定位：配置/状态的异地备份 + 第二台设备的拉取源。**不是**实时双向同步，也**不含**会话历史与附件（那些属于「传文件」）。

## 特性

- **按系统分目录**：`dsh-sync/win/`、`dsh-sync/mac/`、`dsh-sync/linux/`，各存一份，互不覆盖。
- **参照模式**：`pull` 默认只输出逐文件差异（行级 `-`/`+`），不改本机；`apply` 才写入（写入前自动备份）。
- **同步账本**：每次 push/apply 追加一条只增不改的记录（时间/设备/动作/文件清单）。
- **溯源**：远端 manifest 带 `pushedBy`（主机 + 系统），拉取时可见「云端由谁推送」。
- **零第三方运行时依赖**：WebDAV 客户端用 Node 内置 `fetch` 手写（GET/PUT/MKCOL + manifest），不解析 XML。
- **服务端工具 + 侧栏 UI**：聊天里一句话可用，也能在侧栏页点按钮。

## 同步什么

默认白名单（相对 `%DSH_HOME%`，即 `~/.dsh`）：

| 路径 | 内容 |
|---|---|
| `.agent-presets/` | 自定义 agent 预设 |
| `storages/scheduled_tasks.json` | 定时任务 |
| `storages/schedule.json` | 调度器状态 |
| `auto-work/tasks.json` | 自动化任务 |
| `task-board/` | 任务看板 |
| `profiles/desktop/cordis.patch.yml` | 插件/模型/UI 配置 |

合计约几百 KB，不占 WebDAV 配额。

**远端落点**：`<WebDAV 地址>/dsh-sync/<系统>/`。`<WebDAV 地址>` 填 WebDAV 根即可（如坚果云填 `https://dav.jianguoyun.com/dav/`），插件自动建 `dsh-sync/<系统>/` 子目录。

**硬排除（无论 scope 如何都不同步）**：`.credentials.yaml`（密钥）、`.anonymous-user-id`（机器相关）、`*.tmp`、`*.lock`。

**故意不进默认白名单**（机器相关或可重建）：`storages/workspace.json`（含本机绝对路径）、`storages/session_projcache*`（约 74MB 可重建缓存）、`sessions/`、`attachments/`、`dsh-builtin-browser-host/`、`dsh-runtimes/`、`cache/`。

## 安装

1. 把本包放到 `%DSH_HOME%\profiles\desktop\node_modules\dsh-webdav-sync`；
2. 在 `profiles\desktop\package.json` 的 `dsh.profile.bundles` 里加入 `"dsh-webdav-sync"`；
3. 重启 DSH（desktop 端）。

或使用 DSH 的插件管理器：

```
plugin_manager install_bundle target=file:<本包绝对路径>
```

插件自带 `cordis.patch.yml`，以 `- insert: [{ id: webdav-sync, name: dsh-webdav-sync, config: {...} }]` 注册。

## 用法

### 工具（聊天里直接说即可）

| 工具 | 用途 |
|---|---|
| `dsh_sync_config` | 配置 WebDAV 地址 / 用户名 / 密码 |
| `dsh_sync_push` | 推送本机配置/状态到 WebDAV |
| `dsh_sync_pull` | 参照模式：默认只出差异；传 `apply:true` 才写入（写入前自动备份） |
| `dsh_sync_diff` | 只读对比逐文件差异（行级），不改本机 |
| `dsh_sync_status` | 对比本机与云端（一致/本地改动/仅本地/仅云端） |
| `dsh_sync_ledger` | 查看本机同步账本（历史 push/pull，只增不改） |
| `dsh_sync_scope` | 查看当前同步白名单 |

### 侧栏页

左侧栏「WebDAV 同步」：填地址/账号/密码 → 保存；「推送到云端」上传；另一台设备填同一地址 → 「对比差异」先看差异 → 「应用变更」才真正写入。

### 典型流程（两台设备）

```
A 设备：推送到云端
B 设备：对比差异（看行级 diff）→ 应用变更
```

## 架构

单包同时带两半：

- **服务端** `lib/index.js`：注册 `dsh_sync_*` 工具 + `GET/POST /api/dsh-webdav-sync` HTTP 路由。
- **客户端** `client.js`：侧栏「WebDAV 同步」页（配置表单 + 对比差异 / 应用变更 / 推送 / 状态 / 账本）。

WebDAV 客户端用 Node 内置 `fetch` 手写（`GET`/`PUT`/`MKCOL`）；用远端 `dsh-sync-manifest.json`（path → sha256 + `pushedBy`）驱动 pull/status/diff，避免解析 PROPFIND 的 XML。

## 参照模式与同步账本

- **参照模式**：`pull` 默认只读——逐文件对比本地与远端、给出行级差异（`-` 本地、`+` 远端），不改本机；确认后再 `apply:true` 写入。远端是「参考」，不是「强制替换」。
- **同步账本**：每次 push / apply 在本机 `DSH_HOME/dsh-webdav-sync/ledger.json` 追加一条记录（时间/设备/动作/文件数/文件清单），只增不改；侧栏「最近同步记录」与 `dsh_sync_ledger` 可查。

## 凭据与安全

- 凭据存 `%DSH_HOME%\dsh-webdav-sync\config.json`（本地专属，**不进同步范围**），不回显密码，只显示「是否已设置」。
- 也可用环境变量 `DSH_WEBDAV_URL` / `DSH_WEBDAV_USER` / `DSH_WEBDAV_PASS` 提供（优先级：config.json > cordis.patch.yml config > 环境变量）。
- **密码以明文存在本机 config.json**；若 WebDAV 不是完全可信的，建议开独立账号，别复用重要密码。
- `.credentials.yaml` 等密钥文件被硬排除，绝不进 WebDAV。

## 语义与限制

- **单写者 + 手动推拉**：一台用完关掉 DSH 再 push，另一台先 diff/apply。别指望两台同时改（WebDAV 无冲突合并，last-write-wins）。
- `workspace.json` 等机器相关路径默认不同步；同步后若两机工作区路径不同，属于预期现象（本插件不处理路径重映射）。
- 差异为行级文本 diff，超大文件会退化为行数摘要。
- v1 不支持透明加密（如 `rclone crypt`）。需要加密可后续加。

## 修改代码后如何重载

profile 里的 `node_modules/dsh-webdav-sync` 是 pnpm 从源码目录**复制**的（非符号链接）。改完源码后：

1. 重新安装（会重新拷贝并自动 apply/重载）：
   ```
   plugin_manager install_bundle target=file:<本包绝对路径>
   ```
2. 或手动复制 `lib/index.js`、`client.js` 到 `profiles/desktop/node_modules/dsh-webdav-sync/`，再 disable → enable：
   ```
   plugin_manager set_plugin target=include:webdav-sync enabled=false
   plugin_manager set_plugin target=include:webdav-sync enabled=true
   ```

## License

[MIT](./LICENSE)
