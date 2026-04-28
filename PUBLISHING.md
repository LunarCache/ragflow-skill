# 发布到 ClawHub

本文档记录本 Skill 第一次发布到 ClawHub 的完整流程、检查项、命令和本次发布中遇到的实际情况。

本次已发布信息：

- ClawHub slug：`skill-for-ragflow`
- 展示名称：`RAGFlow Skill`
- 初始版本：`1.0.0`
- 发布账号：`lunarcache`
- ClawHub 授权：`MIT-0`
- 仓库内 Skill 包目录：`skill-for-ragflow/`
- 发布页面：`https://clawhub.ai/skills/skill-for-ragflow`
- 首次发布返回 ID：`k97069exs64nb9g9nnkpgcqrt985msbv`

## 1. 准备 Skill 目录

ClawHub 发布的是包含 `SKILL.md` 的 Skill 目录。这个仓库应该发布内层 Skill 包目录，而不是仓库根目录：

```powershell
skill-for-ragflow/
```

发布元数据位于 `skill-for-ragflow/SKILL.md`：

```yaml
---
name: skill-for-ragflow
description: Operate RAGFlow v0.25.x deployments through the bundled Node CLI and API client.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins:
        - node
      env:
        - RAGFLOW_URL
        - RAGFLOW_API_KEY
    primaryEnv: RAGFLOW_API_KEY
    homepage: https://github.com/LunarCache/ragflow-skill
---
```

发布细则：

- `name` 应与 ClawHub slug 保持一致。
- `version` 必须是合法 semver。
- 每次重新发布新版本都要递增 `version`。
- `RAGFLOW_URL` 和 `RAGFLOW_API_KEY` 是正常使用必需项，保留在 `requires.env` 中。
- `RAGFLOW_WEB_TOKEN`、`RAGFLOW_DELETE_CHUNK_RETRIES`、`RAGFLOW_REPRO_*` 等只在特殊功能或诊断场景使用，保留在正文说明中即可，不要声明为必需环境变量，除非未来它们真的变成必需项。

`skill-for-ragflow/.clawhubignore` 用于排除本地密钥和临时文件：

```gitignore
.env
.clawhub/
node_modules/
*.log
npm-debug.log*
coverage/
.nyc_output/
tmp/
temp/
*.tmp
.DS_Store
Thumbs.db
```

不要发布 `.env`。如果需要本地示例，可以保留 `.env.example`，但本次 dry run 显示 ClawHub 实际上传的是 9 个运行和文档文件，没有上传 `.env.example`。

## 2. 安装和登录

安装 ClawHub CLI：

```powershell
npm install -g clawhub
```

登录：

```powershell
clawhub login
```

确认当前账号：

```powershell
clawhub whoami
```

本次发布前确认到的账号：

```text
LunarCache
```

## 3. 检查 slug 是否可用

发布前先检查目标 slug 是否已经存在：

```powershell
clawhub inspect skill-for-ragflow --files
```

判断方式：

- 返回 `Skill not found`：slug 可用。
- 返回已有 Skill 信息：slug 已被占用。如果 owner 不是当前账号，需要换一个 slug。

本次发布时，`ragflow-skill` 已经被另一个 ClawHub 用户占用，所以最终改为 `skill-for-ragflow`。

## 4. 本地验证

先确认 Skill 内置 CLI 能正常启动：

```powershell
node skill-for-ragflow\scripts\ragflow.js --help
```

如果测试路径和当前 Skill 目录一致，再运行完整测试：

```powershell
node --test test/*.test.js
```

如果刚刚重命名过 Skill 目录，而测试仍引用旧目录，需要先更新测试路径；否则不能把完整测试结果当作发布前验证依据。

运行 ClawHub dry run：

```powershell
clawhub sync --root .\skill-for-ragflow --dry-run
```

本次发布前期望输出：

```text
To sync: - skill-for-ragflow  NEW  (9 files)
Dry run: would upload 1 skill(s).
```

本次 dry run 确认将上传 9 个文件：

- `SKILL.md`
- `agents/openai.yaml`
- `lib/api.js`
- `scripts/ragflow.js`
- `scripts/repro-delete-chunks.js`
- `references/API.md`
- `references/COMMANDS.md`
- `references/REFERENCE.md`
- `references/TROUBLESHOOTING.md`

## 5. 正式发布

首次发布命令：

```powershell
clawhub publish .\skill-for-ragflow --slug skill-for-ragflow --name "RAGFlow Skill" --version 1.0.0 --tags latest --changelog "Initial public release for RAGFlow v0.25.x"
```

成功输出：

```text
OK. Published skill-for-ragflow@1.0.0 (k97069exs64nb9g9nnkpgcqrt985msbv)
```

建议在发布记录或 release notes 中保存返回 ID，便于后续排查。

## 6. 常见发布状态和处理

GitHub API 临时限流：

```text
GitHub API rate limit exceeded
```

处理方式：按 CLI 提示等待 reset 时间，然后重试同一条 publish 命令。本次第一次发布时遇到该问题，等待约 35 秒后重试成功。

安全扫描未完成：

```text
Skill is hidden while security scan is pending. Try again in a few minutes.
```

这表示上传已经成功，但 ClawHub 安全扫描尚未完成，Skill 暂时不可见。等待 1-2 分钟后再次 inspect。

## 7. 发布后验证

查看线上 Skill：

```powershell
clawhub inspect skill-for-ragflow --files
```

本次发布后确认到的关键字段：

```text
skill-for-ragflow  RAGFlow Skill
Owner: lunarcache
Latest: 1.0.0
License: MIT-0
Tags: latest=1.0.0
Security: CLEAN
```

获取 JSON 元数据：

```powershell
clawhub inspect skill-for-ragflow --json --files
```

获取线上 `SKILL.md` 内容：

```powershell
clawhub inspect skill-for-ragflow --file SKILL.md
```

## 8. 安全扫描警告说明

本次发布最终状态：

```text
Security: CLEAN
Warnings: yes
```

这些 warning 是提示项，不是阻断项。扫描结果没有发现恶意行为、隐藏外发、无关凭据请求、外部安装器或远程代码下载。

本次 warning 内容：

- `requires-sensitive-credentials`：Skill 需要 `RAGFLOW_API_KEY`，属于敏感凭据。
- 用户应只把 `RAGFLOW_URL` 指向可信 RAGFlow 服务，因为上传文件会发送到该服务。
- `SKILL.md` 和代码中提到了部分可选环境变量，但它们没有写入必需元数据：`RAGFLOW_WEB_TOKEN`、`RAGFLOW_DELETE_CHUNK_RETRIES`、`RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS`、`RAGFLOW_REPRO_*`。
- `scripts/repro-delete-chunks.js` 是诊断脚本，可能创建和删除临时 RAGFlow dataset，并在系统 temp 目录创建临时文件。
- agent invocation 使用平台默认行为；如果用户不希望 agent 自动调用 Skill，可以在 agent 配置里调整。

当前不需要因为这些 warning 立即下架或重发。后续如果希望减少 warning，可以把可选环境变量说明得更明确，或把诊断脚本行为在 `SKILL.md` 中继续写得更醒目。

## 9. 后续版本发布

后续发布流程：

1. 修改代码或文档。
2. 更新 `skill-for-ragflow/SKILL.md` 中的 `version`。
3. 运行本地验证。
4. 运行 `clawhub sync --root .\skill-for-ragflow --dry-run`。
5. 使用同一 slug 发布新版本：

```powershell
clawhub publish .\skill-for-ragflow --slug skill-for-ragflow --name "RAGFlow Skill" --version <new-version> --tags latest --changelog "<release notes>"
```

版本递增建议：

- patch：文档修正、小 bug 修复、兼容性行为改进。
- minor：新增命令、新增可选功能、兼容 API 扩展。
- major：命令参数破坏性变化、必需环境变量变化、或行为不兼容变化。
