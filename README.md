# README.md（中文，更新版）

# Readme-builder-mcp

![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen) ![TypeScript](https://img.shields.io/badge/TypeScript-ready-informational)

一个基于 **Model Context Protocol (MCP)** 的“README 生成器”服务器：

* 提供可在 Trae 等 MCP 客户端中调用的工具；
* 支持自动扫描项目目录、提取路由与环境变量、汇总脚本与依赖；
* 一键生成**GitHub 风格的 README**（中文），并在显式确认后写入磁盘。

> ⚠️ 默认**只读安全**：所有写入磁盘的操作都要求 `confirm: true` 才会执行。

---

## 目录

- [Readme-builder-mcp](#readme-builder-mcp)
  - [目录](#目录)
  - [功能特性](#功能特性)
  - [环境要求](#环境要求)
  - [快速开始](#快速开始)
  - [在 Trae（或其它 MCP 客户端）中使用](#在-trae或其它-mcp-客户端中使用)
  - [工具 API](#工具-api)
    - [1) `detectRepo`](#1-detectrepo)
    - [2) `generateReadme`](#2-generatereadme)
    - [3) `generateReadmePro`](#3-generatereadmepro)
    - [4) `writeFile`](#4-writefile)
  - [典型工作流](#典型工作流)
  - [命令行自测（可选）](#命令行自测可选)
  - [项目结构](#项目结构)
  - [常见问题](#常见问题)
  - [贡献](#贡献)
  - [许可证](#许可证)

---

## 功能特性

* 🧠 **Pro 版 README 生成**：
  `generateReadmePro` 会：

  * 递归扫描目录（忽略 `node_modules` / `dist` 等），生成简洁的**项目结构树**；
  * 基于源码静态匹配提取**API 端点**（如 `app.get('/api')` / `router.post(...)`）；
  * 搜集 `.env.example` 与源码中的 `process.env.*`，罗列**环境变量清单**；
  * 汇总 `npm scripts` 与**依赖清单**，自动推断特性（Express/Mongoose/JWT 等）；
  * 可选**徽章**与**目录**，输出**完整中文 README**。
* 🔒 **默认只读**：
  所有写文件操作必须传入 `confirm: true`，避免误写入。
* 🧩 **MCP 标准**：
  通过 STDIO 运行，适配支持 MCP 的 IDE / 客户端（如 Trae）。
* 🧪 **Zod 输入参数校验**：
  工具输入参数全部通过 Zod 校验，类型安全、错误可控。

---

## 环境要求

* **Node.js** ≥ 18
* 推荐包管理器：npm / pnpm / bun（示例以 npm 为主）

---

## 快速开始

```bash
# 1) 安装依赖
npm i

# 2) 构建 TypeScript
npm run build

# 3) 本地启动（STDIO 模式，不会主动打印界面）
node dist/server.js
```

> 这是一个 **STDIO 服务器**：它会在标准输入/输出上等待 MCP 客户端连接。
> 直接运行看到“没有反应”是正常的——请通过 Trae 等 MCP 客户端来调用它的工具。

---

## 在 Trae（或其它 MCP 客户端）中使用

1. 在 Trae 的 MCP 配置中注册该服务器（指向 **编译后的 JS**）：

   ```json
   {
     "mcpServers": {
       "readme-builder": {
         "command": "node",
         "args": [
           "C\\\\path\\\\to\\\\readme-mcp\\\\dist\\\\server.js"
         ]
       }
     }
   }
   ```

   * Windows 路径建议用双反斜杠；或改用正斜杠。
   * 修改配置后**重启 Trae**，以加载新 MCP 服务器。

2. 在 Trae 的“工具（Tools）”里选择 `readme-builder`，即可看到工具列表：
   `detectRepo`、`generateReadme`、`generateReadmePro`、`writeFile`。

---

## 工具 API

### 1) `detectRepo`

读取指定目录的 `package.json` 并返回关键信息（名称、描述、scripts、dependencies 等）。

**输入参数**

```json
{ "dir": "C\\\\path\\\\to\\\\your-project" }
```

* `dir`：目标仓库绝对路径（省略则取当前工作目录）。

**返回**

* `content[0].text`：包含项目信息的 JSON 字符串。

---

### 2) `generateReadme`

基础版 README 生成（标题 + 简介 + 特性），**只读返回** Markdown。

**输入参数**

```json
{
  "name": "your-project",
  "description": "一句话简介。",
  "features": ["要点1", "要点2"]
}
```

**返回**

* `content[0].text`：Markdown 文本。

---

### 3) `generateReadmePro`

**推荐**。扫描目录，自动生成**GitHub 风格完整 README**（中文）。

**输入参数（建议最少传 `dir` 与 `description`）**

```json
{
  "dir": "C\\\\path\\\\to\\\\your-project",
  "description": "示例 Node.js/Express 项目结构与实践。",
  "addBadges": true,
  "includeTOC": true,
  "maxTreeDepth": 2,
  "language": "zh",
  "extraFeatures": ["额外功能点（可选）"]
}
```

**做的事**

* 读取 `package.json`（名称、scripts、dependencies、engines、license 等）；
* 扫描目录，生成结构树（深度由 `maxTreeDepth` 控制）；
* 匹配 `app.get/post/...` / `router.get/post/...` 识别端点（最多列出 20 条）；
* 汇总 `.env.example` 与源码中的 `process.env.*` 作为“环境变量”章节；
* 从依赖推断功能点（Express/Mongoose/JWT/bcrypt/morgan 等）；
* 选择性添加徽章/目录，输出完整中文 README。

**返回**

* `content[0].text`：Markdown 文本。

---

### 4) `writeFile`

写入文件（需要显式确认 `confirm: true`）。

**输入参数**

```json
{
  "filePath": "C\\\\path\\\\to\\\\your-project\\\\README.md",
  "content": "# your-project\n...完整 Markdown...",
  "confirm": true
}
```

**返回**

* 成功：`已写入：<绝对路径>（<字节数> bytes）`
* 若未设置 `confirm: true`：仅返回预览，不落盘

---

## 典型工作流

1. **探测仓库**

   ```json
   { "tool": "detectRepo", "server": "readme-builder",
     "args": { "dir": "C\\\\path\\\\to\\\\your-project" } }
   ```

2. **生成 README（Pro 版）**

   ```json
   { "tool": "generateReadmePro", "server": "readme-builder",
     "args": {
       "dir": "C\\\\path\\\\to\\\\your-project",
       "description": "你的项目一句话或一段简介。",
       "addBadges": true,
       "includeTOC": true,
       "maxTreeDepth": 2,
       "language": "zh"
     } }
   ```

3. **写入 README.md（显式确认）**

   ```json
   { "tool": "writeFile", "server": "readme-builder",
     "args": {
       "filePath": "C\\\\path\\\\to\\\\your-project\\\\README.md",
       "content": "<把上一步返回的 Markdown 原文粘这里>",
       "confirm": true
     } }
   ```

> 🔐 **安全提醒**：只有当你明确传 `confirm: true` 时才会真正写入磁盘。

---

## 命令行自测（可选）

未接入 Trae 前，你也可以用 MCP 的命令行客户端（选其一）快速验证：

```bash
# 列出工具
npx @modelcontextprotocol/client-cli tools list \
  --command node \
  --args "C:\\path\\to\\readme-mcp\\dist\\server.js"

# 调用 generateReadmePro
npx @modelcontextprotocol/client-cli tools call generateReadmePro \
  --input "{\"dir\":\"C\\\\\\\\path\\\\\\\\to\\\\\\\\your-project\",\"description\":\"示例项目。\",\"addBadges\":true,\"includeTOC\":true,\"language\":\"zh\"}" \
  --command node \
  --args "C:\\path\\to\\readme-mcp\\dist\\server.js"
```

---

## 项目结构 

```
src/
  server.ts          # MCP 服务器入口（含 detectRepo / generateReadme / generateReadmePro / writeFile）
dist/
  server.js          # 构建后的运行文件（Trae 指向的就是它）
package.json
package-lock.json
tsconfig.json
.gitignore
README.md
```

---

## 常见问题

* **运行 `node dist/server.js` 没反应？**
  正常。它是 STDIO 服务端，不会主动输出。请用 Trae 或命令行客户端与之通信。

* **Trae 里看不到工具？**

  * 确认 MCP 配置指向 **dist/server.js**（不是 `src/server.ts`）。
  * 重启 Trae。
  * `node -v` 能在系统 PATH 中执行。

* **写入失败？**

  * 检查是否传了 `confirm: true`；
  * 检查 `filePath` 目录是否存在（本项目会自动 `mkdir -p`）；
  * Windows 路径建议用双反斜杠。

* **API 端点识别不全？**
  正则仅覆盖常见 `app.` / `router.` 调用，且默认最多展示 20 条。复杂路由（动态加载、框架封装）可能无法静态识别。

---

## 贡献

欢迎提 Issue / PR：

* 新增更多框架的路由识别（如 Koa、Hono、Nest）
* 扫描更丰富的配置文件（Docker、Compose、CI 等）
* 生成英文或双语 README

---

## 许可证

该项目根据MIT 许可证

---
