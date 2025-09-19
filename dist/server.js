// src/server.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
/* ---------------------------------------
 * Zod 输入定义（Raw Shape + 解析用对象）
 * registerTool 的 inputSchema 使用 “Raw Shape”
 * 业务里用对应的 z.object(...).parse(args) 做校验解析
 * ------------------------------------- */
const DetectRepoShape = {
    dir: z.string().optional(),
};
const DetectRepoInput = z.object(DetectRepoShape);
const GenerateReadmeShape = {
    name: z.string().min(1),
    description: z.string().optional(),
    features: z.array(z.string()).optional(),
};
const GenerateReadmeInput = z.object(GenerateReadmeShape);
const WriteFileShape = {
    filePath: z.string().min(1),
    content: z.string().min(1),
    confirm: z.boolean().optional(), // 默认 false
};
const WriteFileInput = z.object(WriteFileShape);
const GenerateReadmeProShape = {
    dir: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    extraFeatures: z.array(z.string()).optional(),
    addBadges: z.boolean().optional(),
    includeTOC: z.boolean().optional(),
    maxTreeDepth: z.number().int().min(1).max(5).optional(),
    language: z.enum(["zh", "en"]).optional(),
};
const GenerateReadmeProInput = z.object(GenerateReadmeProShape);
/* ---------------------------------------
 * 小工具函数
 * ------------------------------------- */
async function fileExists(p) {
    try {
        await fs.access(p);
        return true;
    }
    catch {
        return false;
    }
}
async function readJSON(p) {
    try {
        const raw = await fs.readFile(p, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function uniq(arr) {
    return Array.from(new Set(arr));
}
function codeBlock(lang, body) {
    return `\n\`\`\`${lang}\n${body}\n\`\`\`\n`;
}
function asList(items) {
    return items.map((s) => `- ${s}`).join("\n");
}
function detectFeaturesFromDeps(deps) {
    const f = [];
    if (!deps)
        return f;
    const has = (k) => Object.prototype.hasOwnProperty.call(deps, k);
    if (has("express"))
        f.push("基于 Express 的 Web 服务");
    if (has("mongoose"))
        f.push("使用 Mongoose 访问 MongoDB");
    if (has("jsonwebtoken"))
        f.push("JWT 鉴权");
    if (has("bcrypt"))
        f.push("密码哈希（bcrypt）");
    if (has("morgan"))
        f.push("HTTP 请求日志（morgan）");
    if (has("cookie-parser"))
        f.push("Cookie 解析");
    if (has("body-parser"))
        f.push("请求体解析（body-parser）");
    if (has("jade") || has("pug"))
        f.push("模板引擎 (Jade/Pug)");
    return f;
}
function buildBadges(opts) {
    const parts = [];
    if (opts.license) {
        parts.push(`[![License](https://img.shields.io/badge/License-${encodeURIComponent(String(opts.license))}-blue.svg)](./LICENSE)`);
    }
    if (opts.node) {
        parts.push(`![Node](https://img.shields.io/badge/node-${encodeURIComponent(String(opts.node))}-brightgreen)`);
    }
    if (opts.ts) {
        parts.push("![TypeScript](https://img.shields.io/badge/TypeScript-ready-informational)");
    }
    return parts.join(" ");
}
async function buildTree(dir, depth) {
    const patterns = [
        "**/*",
        "!node_modules/**",
        "!dist/**",
        "!.git/**",
        "!coverage/**",
        "!**/*.map",
    ];
    const entries = await fg(patterns, {
        cwd: dir,
        dot: false,
        onlyFiles: false,
        followSymbolicLinks: false,
    });
    const rels = entries.map((p) => p.replace(/\\/g, "/"));
    // 限制深度：把超过 depth 的路径截断
    const trimmed = uniq(rels
        .map((r) => {
        const segs = r.split("/");
        return segs.slice(0, Math.min(segs.length, depth)).join("/");
    })
        .filter(Boolean)).sort();
    // 用缩进画一个简易树（只展示到 depth）
    const lines = [];
    for (const r of trimmed) {
        const segs = r.split("/");
        let acc = "";
        for (let i = 0; i < segs.length; i++) {
            const name = segs[i];
            const indent = "  ".repeat(i);
            if (i === 0) {
                acc = name;
                lines.push(`${indent}${name}`);
            }
            else {
                acc += `/${name}`;
                lines.push(`${indent}└─ ${name}`);
            }
        }
    }
    return lines.join("\n");
}
async function grepEnvKeys(dir) {
    const patterns = [
        "**/*.js",
        "**/*.ts",
        "!node_modules/**",
        "!dist/**",
        "!.git/**",
        "!**/*.d.ts",
    ];
    const files = await fg(patterns, { cwd: dir });
    const keys = new Set();
    const envExample = path.join(dir, ".env.example");
    if (await fileExists(envExample)) {
        const raw = await fs.readFile(envExample, "utf8");
        raw.split(/\r?\n/).forEach((line) => {
            const m = line.match(/^([A-Z0-9_]+)=/);
            if (m)
                keys.add(m[1]);
        });
    }
    for (const f of files) {
        const abs = path.join(dir, f);
        const raw = await fs.readFile(abs, "utf8");
        const re = /process\.env\.([A-Z0-9_]+)/g;
        let m;
        while ((m = re.exec(raw))) {
            keys.add(m[1]);
        }
    }
    return Array.from(keys).sort();
}
async function grepHttpRoutes(dir) {
    const patterns = ["**/*.js", "!node_modules/**", "!dist/**", "!.git/**"];
    const files = await fg(patterns, { cwd: dir });
    const routes = [];
    const method = /\b(app|router)\.(get|post|put|delete|patch|options|head)\s*\(\s*["'`]([^"'`]+)["'`]/g;
    for (const f of files) {
        const abs = path.join(dir, f);
        const raw = await fs.readFile(abs, "utf8");
        let m;
        while ((m = method.exec(raw))) {
            const verb = m[2].toUpperCase();
            const url = m[3];
            routes.push(`${verb} ${url}`);
        }
    }
    return uniq(routes).sort().slice(0, 20); // 最多显示 20 条
}
function renderScripts(scripts) {
    if (!scripts || Object.keys(scripts).length === 0)
        return "(无脚本)";
    const lines = Object.entries(scripts).map(([k, v]) => `npm run ${k}  # ${v}`);
    return lines.join("\n");
}
function renderTechStack(deps) {
    if (!deps)
        return "- (未检测到依赖)";
    const keys = Object.keys(deps).sort();
    return asList(keys.map((k) => `${k} ${deps[k]}`));
}
/* ---------------------------------------
 * README 生成：基础版
 * ------------------------------------- */
function buildReadmeBasic(input) {
    const name = input.name;
    const description = input.description ?? "";
    const features = input.features ?? [];
    const feats = features.length ? features.map((f) => `- ${f}`).join("\n") : "- 简洁易用";
    return `# ${name}

${description}

## 特性
${feats}
`;
}
function buildReadmePro(input) {
    const { name, description, badges, toc, features, scriptsText, treeText, routes, envKeys, techStack, language, } = input;
    const tocText = toc && language === "zh"
        ? `
## 目录
- [简介](#简介)
- [特性](#特性)
- [快速开始](#快速开始)
- [运行脚本](#运行脚本)
- [项目结构](#项目结构)
- [API 端点](#api-端点)
- [环境变量](#环境变量)
- [技术栈](#技术栈)
- [许可](#许可)
`
        : "";
    const featuresText = features.length
        ? asList(features)
        : "- 简洁易用\n- 可扩展的工具系统\n- 默认只读，手动确认才写入";
    const routesText = routes.length
        ? asList(routes)
        : "- (未检测到路由定义；或许位于其它文件/框架抽象中)";
    const envText = envKeys.length
        ? asList(envKeys.map((k) => `${k}=(请填写你的值)`))
        : "- (未检测到环境变量；如使用 MongoDB/JWT，请在 .env 中配置)";
    return `# ${name}
${badges ? `\n${badges}\n` : ""}

${description || "（在此填写项目简介）"}
${tocText}
## 简介
${description || "本项目提供一个 Node.js/Express 示例，集成常见中间件与实践。"}

## 特性
${featuresText}

## 快速开始
${codeBlock("bash", `# 1) 安装依赖
npm i

# 2) 本地运行
npm start

# 3) 默认访问
http://localhost:3000`)}

## 运行脚本
${codeBlock("bash", scriptsText)}

## 项目结构
${codeBlock("", treeText)}

## API 端点
${routesText}

## 环境变量
${envText}

## 技术栈
${techStack}

## 许可
(未指定；如需开源，建议补充 LICENSE 文件。)
`;
}
/* ---------------------------------------
 * 启动 MCP 服务器
 * ------------------------------------- */
async function main() {
    const server = new McpServer({
        name: "readme-mcp",
        version: "0.2.0",
    });
    // 1) detectRepo
    server.registerTool("detectRepo", {
        title: "检测仓库",
        description: "读取指定目录的 package.json 并返回关键信息",
        inputSchema: DetectRepoShape,
    }, async (args) => {
        const { dir } = DetectRepoInput.parse(args);
        const base = dir ?? process.cwd();
        const pkgPath = path.join(base, "package.json");
        const exists = await fs
            .access(pkgPath)
            .then(() => true)
            .catch(() => false);
        if (!exists) {
            return { content: [{ type: "text", text: `未找到 ${pkgPath}` }] };
        }
        const raw = await fs.readFile(pkgPath, "utf8");
        const pkg = JSON.parse(raw);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        name: pkg.name ?? null,
                        version: pkg.version ?? null,
                        description: pkg.description ?? null,
                        scripts: pkg.scripts ?? null,
                        dependencies: pkg.dependencies ?? null,
                        devDependencies: pkg.devDependencies ?? null,
                        license: pkg.license ?? null,
                        engines: pkg.engines ?? null,
                    }, null, 2),
                },
            ],
        };
    });
    // 2) generateReadme（基础版）
    server.registerTool("generateReadme", {
        title: "生成 README（只读）",
        description: "根据项目信息生成 README Markdown（只读返回）",
        inputSchema: GenerateReadmeShape,
    }, async (args) => {
        const parsed = GenerateReadmeInput.parse(args);
        const md = buildReadmeBasic(parsed);
        return { content: [{ type: "text", text: md }] };
    });
    // 3) writeFile
    server.registerTool("writeFile", {
        title: "写文件（需确认）",
        description: "confirm=true 才会写入磁盘；否则只返回预览",
        inputSchema: WriteFileShape,
    }, async (args) => {
        const { filePath, content, confirm } = WriteFileInput.parse(args);
        if (!confirm) {
            return {
                content: [
                    {
                        type: "text",
                        text: `安全提示：未设置 confirm=true，不写入。预览：\n${content.slice(0, 500)}`,
                    },
                ],
            };
        }
        const abs = path.isAbsolute(filePath)
            ? filePath
            : path.join(process.cwd(), filePath);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, content, "utf8");
        return {
            content: [
                {
                    type: "text",
                    text: `已写入：${abs}（${Buffer.byteLength(content, "utf8")} bytes）`,
                },
            ],
        };
    });
    // 4) generateReadmePro（自动扫描并生成完整中文 README）
    server.registerTool("generateReadmePro", {
        title: "生成 README（Pro）",
        description: "扫描指定目录并生成完整的 GitHub 风格 README（徽章、目录、脚本、结构、路由、环境变量、技术栈等）",
        inputSchema: GenerateReadmeProShape,
    }, async (args) => {
        const parsed = GenerateReadmeProInput.parse(args);
        const dir = parsed.dir ?? process.cwd();
        const pkg = await readJSON(path.join(dir, "package.json"));
        const name = parsed.name ?? pkg?.name ?? path.basename(dir);
        const description = parsed.description ?? "";
        const addBadges = parsed.addBadges ?? true;
        const includeTOC = parsed.includeTOC ?? true;
        const maxTreeDepth = parsed.maxTreeDepth ?? 2;
        const language = parsed.language ?? "zh";
        // 徽章
        let licenseText = null;
        const hasLicenseFile = (await fileExists(path.join(dir, "LICENSE"))) ||
            (await fileExists(path.join(dir, "LICENSE.md"))) ||
            (await fileExists(path.join(dir, "LICENSE.txt")));
        if (hasLicenseFile) {
            licenseText = pkg?.license ?? "License";
        }
        const badges = addBadges
            ? buildBadges({
                license: licenseText,
                node: pkg?.engines?.node ?? null,
                ts: await fileExists(path.join(dir, "tsconfig.json")),
            })
            : "";
        // 自动特性 + 额外特性
        const deps = pkg?.dependencies ?? null;
        const autoFeatures = detectFeaturesFromDeps(deps);
        const features = uniq([...(autoFeatures ?? []), ...(parsed.extraFeatures ?? [])]);
        // 运行脚本
        const scriptsText = renderScripts(pkg?.scripts);
        // 目录树、路由、环境变量、技术栈
        const treeText = await buildTree(dir, maxTreeDepth);
        const routes = await grepHttpRoutes(dir);
        const envKeys = await grepEnvKeys(dir);
        const techStack = renderTechStack(deps);
        const md = buildReadmePro({
            name,
            description,
            badges,
            toc: includeTOC,
            features,
            scriptsText,
            treeText,
            routes,
            envKeys,
            techStack,
            language,
        });
        return { content: [{ type: "text", text: md }] };
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
