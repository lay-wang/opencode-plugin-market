import { Plugin } from "@opencode/plugin"
import { Market } from "./rpc.js"
import fs from "node:fs/promises"
import { spawn } from "node:child_process"
import { homedir } from "node:os"
import { join } from "node:path"

const SELF = "plugin-market"
const SOURCE = "https://www.opendock.net/zh/plugins-index.json"
const CACHE_MS = 12 * 60 * 60 * 1000
// Bump when the shape of a cached entry changes, so an old cache is refetched instead of read.
const CACHE_V = 2

const configDir = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "opencode")
const cachePath = join(configDir, SELF, ".catalog.json")

type Entry = {
  name: string
  title: string
  description: string
  stars: number
  downloads: number
  score: number
  category: string
  opencode: string | null
  health: string
  pushedAt: number
}

type Filter = {
  query: string
  installed: boolean
  category: string | null
  health: string | null
  opencode: string | null
  days: number | null
  minStars: number | null
  offset: number
  limit: number
}

const CATEGORY_LABELS: Record<string, string> = {
  auth: "认证与凭证",
  memory: "记忆与上下文",
  mcp: "MCP 集成",
  git: "Git 与版本控制",
  agents: "智能体编排",
  tools: "工具与命令",
  code: "代码智能",
  observability: "可观测与分析",
  providers: "模型接入",
  notify: "通知与集成",
  ui: "界面与主题",
  sandbox: "沙箱与基础设施",
  testing: "测试与质量",
  other: "其他",
}

/* ---------- config, read-only ---------- */

const configPath = async (): Promise<string | null> => {
  for (const name of ["opencode.jsonc", "opencode.json"]) {
    const path = join(configDir, name)
    try {
      await fs.access(path)
      return path
    } catch {}
  }
  return null
}

// Comments and strings are skipped so the scanner never trips on a URL or a quote in a comment.
function stripJsonc(src: string): string {
  let out = ""
  for (let i = 0; i < src.length; ) {
    const c = src[i]
    if (c === '"') {
      let j = i + 1
      while (j < src.length) {
        if (src[j] === "\\") j += 2
        else if (src[j] === '"') {
          j++
          break
        } else j++
      }
      out += src.slice(i, j)
      i = j
      continue
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++
      continue
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2)
      i = end < 0 ? src.length : end + 2
      continue
    }
    out += c
    i++
  }
  return out
}

function pluginsOf(src: string): unknown[] {
  try {
    const config = JSON.parse(stripJsonc(src))
    return Array.isArray(config?.plugins) ? config.plugins : []
  } catch {
    return []
  }
}

const bareSpec = (spec: string) => spec.replace(/@[^@/]*$/, "")

/* ---------- catalog ---------- */

async function readCatalog(): Promise<{ at: number; items: Entry[] }> {
  try {
    const cached = JSON.parse(await fs.readFile(cachePath, "utf8"))
    if (cached.v === CACHE_V && Date.now() - cached.at < CACHE_MS && Array.isArray(cached.items)) return cached
  } catch {}
  const res = await fetch(SOURCE)
  if (!res.ok) throw new Error(`插件目录下载失败：HTTP ${res.status}`)
  const raw = (await res.json()) as Array<Record<string, unknown>>
  const items: Entry[] = raw.map((entry) => ({
    name: String(entry.name ?? ""),
    title: String(entry.title ?? entry.name ?? ""),
    description: String(entry.descriptionZh || entry.description || ""),
    stars: Number(entry.stars ?? 0),
    downloads: Number(entry.downloadsMonth ?? 0),
    score: Number(entry.score ?? 0),
    category: String(entry.category ?? ""),
    opencode: (entry.opencode as string | null) ?? null,
    health: String(entry.healthLevel ?? ""),
    pushedAt: Date.parse(String(entry.pushedAt ?? "")) || 0,
  }))
  const next = { v: CACHE_V, at: Date.now(), items }
  await fs.mkdir(join(configDir, SELF), { recursive: true })
  await fs.writeFile(cachePath, JSON.stringify(next))
  return next
}

const today = () => Math.floor(Date.now() / 86_400_000) * 86_400_000

const matches = (entry: Entry, filter: Filter) => {
  if (filter.category && entry.category !== filter.category) return false
  if (filter.health && entry.health !== filter.health) return false
  if (filter.opencode === "v2" && entry.opencode !== "v2" && entry.opencode !== "both") return false
  if (filter.opencode === "v1" && entry.opencode !== "v1" && entry.opencode !== "both") return false
  if (filter.opencode === "none" && entry.opencode !== null) return false
  // Whole days, like the site: a date is in the window when its own day is, whatever the clock time now.
  if (filter.days && entry.pushedAt < today() - filter.days * 86_400_000) return false
  if (filter.minStars && entry.stars < filter.minStars) return false
  const query = filter.query.trim().toLowerCase()
  return (
    !query ||
    entry.name.toLowerCase().includes(query) ||
    entry.title.toLowerCase().includes(query) ||
    entry.description.toLowerCase().includes(query)
  )
}

/* ---------- install ---------- */

/** The CLI that owns this server, falling back to the desktop app's bundled copy. */
async function cliCandidates(): Promise<string[]> {
  const found: string[] = []
  if (/opencode/i.test(process.execPath ?? "")) found.push(process.execPath)
  const root = join(homedir(), "Library/Application Support/ai.opencode.desktop/cli")
  try {
    const versions = (await fs.readdir(root)).sort().reverse()
    for (const version of versions) found.push(join(root, version, "opencode-cli"))
  } catch {}
  found.push(join(homedir(), ".local/bin/opencode"))
  return found
}

async function runCli(args: string[]): Promise<void> {
  let failure = ""
  for (const bin of await cliCandidates()) {
    try {
      await fs.access(bin)
    } catch {
      continue
    }
    const result = await new Promise<{ code: number; output: string }>((resolve) => {
      const child = spawn(bin, args, { env: process.env })
      let output = ""
      child.stdout.on("data", (chunk) => (output += chunk))
      child.stderr.on("data", (chunk) => (output += chunk))
      child.on("error", (error) => resolve({ code: 1, output: String(error) }))
      child.on("close", (code) => resolve({ code: code ?? 0, output }))
    })
    if (result.code === 0) return
    failure = result.output.trim() || `退出码 ${result.code}`
    // A missing binary reads differently from a failed install; only the former is worth retrying.
    if (!/ENOENT/.test(result.output)) throw new Error(failure)
  }
  throw new Error(failure || "找不到 opencode 命令行")
}

export default Plugin.define({
  id: SELF,
  async setup(ctx) {
    type Runtime = { id: string; source: Record<string, unknown>; state: { status: string; error?: string } }

    const list = async (): Promise<Runtime[]> => {
      const listed = await ctx.plugin.list()
      return (Array.isArray(listed) ? listed : ((listed as { data?: unknown[] })?.data ?? [])) as Runtime[]
    }

    const specs = async (): Promise<string[]> => {
      const path = await configPath()
      const src = path ? await fs.readFile(path, "utf8") : ""
      return pluginsOf(src)
        .map((entry) =>
          typeof entry === "string"
            ? entry
            : typeof (entry as { package?: unknown })?.package === "string"
              ? (entry as { package: string }).package
              : "",
        )
        .filter(Boolean) as string[]
    }

    const find = (runtime: Runtime[], spec: string) =>
      runtime.find((plugin) => {
        const target = String(plugin.source.target ?? plugin.source.path ?? plugin.id)
        return bareSpec(target) === bareSpec(spec) || bareSpec(target).endsWith(bareSpec(spec))
      })

    /** Waits until the runtime agrees that a spec is loaded (or gone), so the list never shows a stale answer. */
    const settle = async (spec: string, present: boolean, timeout: number) => {
      const deadline = Date.now() + timeout
      while (Date.now() < deadline) {
        if (Boolean(find(await list(), spec)) === present) return
        await new Promise((resolve) => setTimeout(resolve, 400))
      }
    }

    const market = async (filter: Filter) => {
      const { at, items } = await readCatalog()
      const installed = new Set((await specs()).filter((spec) => !spec.startsWith("-")).map(bareSpec))
      const isInstalled = (entry: Entry) => [...installed].some((spec) => spec === entry.name || spec.endsWith(entry.name))
      const rows = items
        .filter((entry) => matches(entry, filter))
        .filter((entry) => !filter.installed || isInstalled(entry))
        .map((entry) => ({ ...entry, installed: isInstalled(entry) }))
        .sort((a, b) => b.score - a.score)

      // Counts come from the whole catalog, as the site shows them, not from the current search.
      const count = (test: (entry: Entry) => boolean) => items.filter(test).length
      const categories = [...new Set(items.map((entry) => entry.category))]
        .map((id) => ({ id, label: CATEGORY_LABELS[id] ?? id, count: count((entry) => entry.category === id) }))
        .sort((a, b) => b.count - a.count)

      return {
        at,
        total: rows.length,
        items: rows.slice(filter.offset, filter.offset + filter.limit),
        categories,
        counts: {
          health: {
            ok: count((entry) => entry.health === "ok"),
            warn: count((entry) => entry.health === "warn"),
            danger: count((entry) => entry.health === "danger"),
          },
          opencode: {
            v2: count((entry) => entry.opencode === "v2" || entry.opencode === "both"),
            v1: count((entry) => entry.opencode === "v1" || entry.opencode === "both"),
            none: count((entry) => entry.opencode === null),
          },
          days: {
            d7: count((entry) => entry.pushedAt >= today() - 7 * 86_400_000),
            d30: count((entry) => entry.pushedAt >= today() - 30 * 86_400_000),
            d180: count((entry) => entry.pushedAt >= today() - 180 * 86_400_000),
          },
          stars: {
            s10: count((entry) => entry.stars >= 10),
            s100: count((entry) => entry.stars >= 100),
            s1000: count((entry) => entry.stars >= 1000),
          },
        },
      }
    }

    const install = async (input: { name: string }) => {
      try {
        if (!/^(@[\w.-]+\/)?[\w.-]+$/.test(input.name)) throw new Error("包名不合法，已放弃安装")
        await runCli(["plugin", "add", input.name])
        await settle(input.name, true, 90_000)
        // An installed plugin can still be broken; say so now rather than leaving a silently dead row.
        const loaded = find(await list(), input.name)
        if (!loaded) return { ok: false, error: "安装完成，但服务端没有加载它（可能需要重启）" }
        if (loaded.state.status !== "active") return { ok: false, error: `已安装，但加载失败：${loaded.state.error ?? "未知原因"}` }
        return { ok: true, error: null }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }

    const uninstall = async (input: { name: string }) => {
      try {
        const spec = (await specs()).find(
          (candidate) => !candidate.startsWith("-") && (bareSpec(candidate) === input.name || bareSpec(candidate).endsWith(input.name)),
        )
        if (!spec) throw new Error("配置里没有这个插件")
        await runCli(["plugin", "remove", spec])
        await settle(spec, false, 20_000)
        return { ok: true, error: null }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }

    await ctx.rpc.register(Market, { market, install, uninstall })
  },
})
