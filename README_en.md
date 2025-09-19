# README.en.md（English, updated)

# Readme-builder-mcp

![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen) ![TypeScript](https://img.shields.io/badge/TypeScript-ready-informational)

An MCP (Model Context Protocol) “README generator” server that:

- exposes tools callable from MCP clients like Trae,
- scans a project to gather structure, routes, env variables, scripts, and dependencies,
- generates a **GitHub-style README (Chinese by default)** and writes it to disk **only when explicitly confirmed**.

> ⚠️ **Read-only by default**: any disk write requires `confirm: true`.

---

## Table of Contents

- [Readme-builder-mcp](#readme-builder-mcp)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Requirements](#requirements)
  - [Quick Start](#quick-start)
  - [Use with Trae (or any MCP client)](#use-with-trae-or-any-mcp-client)
  - [Tools API](#tools-api)
    - [1) `detectRepo`](#1-detectrepo)
    - [2) `generateReadme`](#2-generatereadme)
    - [3) `generateReadmePro`  — **Recommended**](#3-generatereadmepro---recommended)
    - [4) `writeFile`](#4-writefile)
  - [Typical Workflow](#typical-workflow)
  - [CLI Self-Test (optional)](#cli-self-test-optional)
  - [Project Structure](#project-structure)
  - [FAQ](#faq)
  - [Contributing](#contributing)
  - [License](#license)

---

## Features

- 🧠 **Pro README generation** (`generateReadmePro`):
  - Recursively scans the repo (ignoring `node_modules`, `dist`, etc.) and renders a concise **project tree**.
  - Statically extracts **API endpoints** from calls like `app.get(...)` / `router.post(...)`.
  - Collects **environment variables** from `.env.example` and `process.env.*` found in source.
  - Summarizes **npm scripts** & **dependencies**, infers features (Express / Mongoose / JWT / bcrypt / morgan, etc.).
  - Optional **badges** and **Table of Contents**; outputs a full **Chinese README**.
- 🔒 **Safe by default**: disk writes require `confirm: true` to avoid accidental changes.
- 🧩 **MCP-compliant**: runs over STDIO; works with MCP-aware IDEs/clients (e.g., Trae).
- 🧪 **Zod-validated inputs** for robust parameter handling.

---

## Requirements

- **Node.js** ≥ 18
- Package manager: npm / pnpm / bun (examples below use npm)

---

## Quick Start

```bash
# 1) Install deps
npm i

# 2) Build TypeScript
npm run build

# 3) Start locally (STDIO server; waits for an MCP client)
node dist/server.js
````

> This is an **STDIO** server: it waits for an MCP client to connect over stdin/stdout.
> Seeing “no output” when running directly is normal—use Trae or another MCP client to call tools.

---

## Use with Trae (or any MCP client)

1. Register this server in Trae’s MCP config (point to **compiled JS**):

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

* On Windows, double backslashes are recommended; forward slashes also work.
* **Restart Trae** after editing the config so it loads the MCP server.

2. In Trae’s **Tools** panel, select `readme-builder` and you should see:
   `detectRepo`, `generateReadme`, `generateReadmePro`, `writeFile`.

---

## Tools API

### 1) `detectRepo`

Reads `package.json` in a target directory and returns key fields (name, description, scripts, dependencies, etc.).

**Input**

```json
{ "dir":"C\\\\path\\\\to\\\\your-project" }
```

* `dir`: absolute path to the target repo (defaults to current working directory if omitted).

**Output**

* `content[0].text`: JSON string containing the project’s metadata.

---

### 2) `generateReadme`

Basic README generator (title + intro + features). **Returns Markdown only** (no write).

**Input**

```json
{
  "name": "your-project",
  "description": "One-line intro.",
  "features": ["Point A", "Point B"]
}
```

**Output**

* `content[0].text`: Markdown.

---

### 3) `generateReadmePro`  — **Recommended**

Scans a directory and produces a **full GitHub-style README (Chinese)**.

**Suggested minimal inputs**

```json
{
  "dir":"C\\\\path\\\\to\\\\your-project",
  "description": "Node.js/Express project structure & practices.",
  "addBadges": true,
  "includeTOC": true,
  "maxTreeDepth": 2,
  "language": "zh",
  "extraFeatures": ["(Optional extra features you want to highlight)"]
}
```

**What it does**

* Reads `package.json` (name, scripts, dependencies, engines, license).
* Builds a project tree at depth `maxTreeDepth`.
* Extracts endpoints via `app.get/post/...` and `router.get/post/...` (lists up to 20).
* Gathers env keys from `.env.example` and `process.env.*` in source.
* Infers features from dependencies (Express/Mongoose/JWT/bcrypt/morgan, etc.).
* Optionally adds badges/TOC; outputs a full **Chinese** README.

**Output**

* `content[0].text`: Markdown.

---

### 4) `writeFile`

Writes a file (**requires** `confirm: true`).

**Input**

```json
{
  "filePath": "C\\\\path\\\\to\\\\your-project\\\\README.md",
  "content": "# your-project\n...full Markdown...",
  "confirm": true
}
```

**Output**

* Success: `Written: <absolute path> (<bytes> bytes)`
* Without `confirm: true`: returns a preview only; **no** write happens

---

## Typical Workflow

1. **Detect repo**

```json
{ "tool": "detectRepo", "server": "readme-builder",
  "args": { "dir":"C\\\\path\\\\to\\\\your-project" } }
```

2. **Generate README (Pro)**

```json
{ "tool": "generateReadmePro", "server": "readme-builder",
  "args": {
    "dir":"C\\\\path\\\\to\\\\your-project",
    "description": "Brief intro to your project.",
    "addBadges": true,
    "includeTOC": true,
    "maxTreeDepth": 2,
    "language": "zh"
  } }
```

3. **Write README.md (explicit confirm)**

```json
{ "tool": "writeFile", "server": "readme-builder",
  "args": {
    "filePath": "C\\\\path\\\\to\\\\your-project\\\\README.md",
    "content": "<paste the Markdown from step 2>",
    "confirm": true
  } }
```

> 🔐 Only when `confirm: true` is set will the server actually write to disk.

---

## CLI Self-Test (optional)

Before wiring up Trae, you can test with the MCP CLI:

```bash
# List tools
npx @modelcontextprotocol/client-cli tools list \
  --command node \
  --args "C:\\path\\to\\readme-mcp\\dist\\server.js"

# Call generateReadmePro
npx @modelcontextprotocol/client-cli tools call generateReadmePro \
  --input "{\"dir\":\"C\\\\\\\\path\\\\\\\\to\\\\\\\\your-project\",\"description\":\"Sample project.\",\"addBadges\":true,\"includeTOC\":true,\"language\":\"zh\"}" \
  --command node \
  --args "C:\\path\\to\\readme-mcp\\dist\\server.js"
```

---

## Project Structure

```
src/
  server.ts          # MCP server entry (detectRepo / generateReadme / generateReadmePro / writeFile)
dist/
  server.js          # Built output (Trae should point here)
package.json
package-lock.json
tsconfig.json
.gitignore
README.md
```

---

## FAQ

* **Running `node dist/server.js` shows no output—why?**
  That’s expected. It’s an STDIO server; use Trae or the CLI to interact with it.

* **Can’t see tools in Trae?**

  * Ensure your MCP config points to `dist/server.js` (not `src/server.ts`).
  * Restart Trae.
  * Make sure `node -v` works in your PATH.

* **Write fails?**

  * Did you set `confirm: true`?
  * Ensure the `filePath` directory is writable (the server will `mkdir -p` as needed).
  * On Windows, prefer double backslashes.

* **Not all endpoints show up?**
  Route extraction uses simple regex over common `app.` / `router.` patterns and caps at 20 lines. Framework abstractions or dynamic loaders may not be detected.

---

## Contributing

PRs and issues welcome:

* More framework route detectors (Koa, Hono, Nest, etc.)
* Additional config scanners (Docker/Compose/CI)
* English or bilingual README generation

---

## License

MIT
