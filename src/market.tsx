import { For, Show, createSignal, onMount } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { Market } from "./rpc"

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
  installed: boolean
}

type Category = { id: string; label: string; count: number }
type Counts = {
  health: { ok: number; warn: number; danger: number }
  opencode: { v2: number; v1: number; none: number }
  days: { d7: number; d30: number; d180: number }
  stars: { s10: number; s100: number; s1000: number }
}

const CONFIRMED = "plugin-market:install-confirmed"
const PAGE = 50

const compact = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}m` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)

export default function MarketPage() {
  const ctx = usePlugin()
  const [query, setQuery] = createSignal("")
  const [installedOnly, setInstalledOnly] = createSignal(false)
  const [category, setCategory] = createSignal<string | null>(null)
  const [health, setHealth] = createSignal<string | null>(null)
  const [opencode, setOpencode] = createSignal<string | null>(null)
  const [days, setDays] = createSignal<number | null>(null)
  const [minStars, setMinStars] = createSignal<number | null>(null)
  const [rows, setRows] = createSignal<Entry[]>([])
  const [categories, setCategories] = createSignal<Category[]>([])
  const [counts, setCounts] = createSignal<Counts | null>(null)
  const [total, setTotal] = createSignal(0)
  const [at, setAt] = createSignal(0)
  const [loading, setLoading] = createSignal(true)
  const [more, setMore] = createSignal(false)
  const [busy, setBusy] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  const filters = () => ({ category: category(), health: health(), opencode: opencode(), days: days(), minStars: minStars() })
  const active = () => Object.values(filters()).filter((value) => value !== null).length + (installedOnly() ? 1 : 0)

  const load = async (append = false) => {
    if (append) setMore(true)
    else setLoading(true)
    try {
      const offset = append ? rows().length : 0
      const next = await ctx.client.rpc(Market).market({ query: query(), installed: installedOnly(), ...filters(), offset, limit: PAGE })
      if (ctx.signal.aborted) return
      setRows(append ? [...rows(), ...(next.items as Entry[])] : (next.items as Entry[]))
      setCategories(next.categories as Category[])
      setCounts(next.counts as Counts)
      setTotal(next.total)
      setAt(next.at)
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
      setMore(false)
    }
  }

  onMount(() => void load())

  const clear = () => {
    setCategory(null)
    setHealth(null)
    setOpencode(null)
    setDays(null)
    setMinStars(null)
    setInstalledOnly(false)
    void load()
  }

  const pick = (entry: Entry) => {
    if (entry.installed) return void run(entry, false)
    // Installing runs someone else's npm code as this server, so the first one needs a deliberate yes.
    if (localStorage.getItem(CONFIRMED)) return void run(entry, true)
    ctx.dialogs.open((dialog) => (
      <ctx.ui.Dialog
        title={ctx.t("confirmTitle")}
        footer={
          <div style={{ display: "flex", gap: "8px" }}>
            <ctx.ui.Button onClick={dialog.close}>{ctx.t("cancel")}</ctx.ui.Button>
            <ctx.ui.Button
              variant="contrast"
              onClick={() => {
                localStorage.setItem(CONFIRMED, "1")
                dialog.close()
                void run(entry, true)
              }}
            >
              {ctx.t("confirmOk")}
            </ctx.ui.Button>
          </div>
        }
      >
        <div style={{ "line-height": 1.6 }}>
          <p style={{ margin: "0 0 8px" }}>{ctx.t("confirmBody")}</p>
          <p style={{ margin: 0, opacity: 0.7 }}>
            <code>{entry.name}</code>
          </p>
        </div>
      </ctx.ui.Dialog>
    ))
  }

  const run = async (entry: Entry, install: boolean) => {
    setBusy(entry.name)
    try {
      const result = install
        ? await ctx.client.rpc(Market).install({ name: entry.name })
        : await ctx.client.rpc(Market).uninstall({ name: entry.name })
      setError(result.ok ? null : (result.error ?? ctx.t("failed")))
      await load()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  const Option = (option: {
    label: string
    value: string | number | null
    current: () => string | number | null
    set: (value: any) => void
    count?: number
  }) => (
    <ctx.ui.Button
      size="small"
      variant={option.current() === option.value ? "contrast" : "neutral"}
      onClick={() => {
        option.set(option.value)
        void load()
      }}
    >
      {option.label}
      <Show when={option.count !== undefined}>
        <span style={{ opacity: 0.5, "margin-left": "6px" }}>{compact(option.count!)}</span>
      </Show>
    </ctx.ui.Button>
  )

  const Section = (section: { title: string; children: JSX.Element }) => (
    <div style={{ "margin-bottom": "14px" }}>
      <div style={{ "font-size": "12px", opacity: 0.5, "margin-bottom": "6px" }}>{section.title}</div>
      <div style={{ display: "flex", "flex-wrap": "wrap", gap: "6px" }}>{section.children}</div>
    </div>
  )

  const Chip = (chip: { label: string; clear: () => void }) => (
    <ctx.ui.Button
      size="small"
      variant="ghost"
      onClick={() => {
        chip.clear()
        void load()
      }}
    >
      {chip.label} ✕
    </ctx.ui.Button>
  )

  const openFilters = () =>
    ctx.dialogs.open((dialog) => (
      <ctx.ui.Dialog
        title={ctx.t("filters")}
        size="large"
        footer={
          <div style={{ display: "flex", gap: "8px", width: "100%", "align-items": "center" }}>
            <ctx.ui.Button onClick={clear}>{ctx.t("clear")}</ctx.ui.Button>
            <div style={{ flex: 1 }} />
            <ctx.ui.Button variant="contrast" onClick={dialog.close}>
              {ctx.t("viewCount").replace("{n}", String(total()))}
            </ctx.ui.Button>
          </div>
        }
      >
        <Section title={ctx.t("category")}>
          <Option label={ctx.t("any")} value={null} current={category} set={setCategory} />
          <For each={categories()}>
            {(item) => <Option label={item.label} value={item.id} current={category} set={setCategory} count={item.count} />}
          </For>
        </Section>
        <Section title={ctx.t("health")}>
          <Option label={ctx.t("any")} value={null} current={health} set={setHealth} />
          <Option label={ctx.t("healthy")} value="ok" current={health} set={setHealth} count={counts()?.health.ok} />
          <Option label={ctx.t("warn")} value="warn" current={health} set={setHealth} count={counts()?.health.warn} />
          <Option label={ctx.t("danger")} value="danger" current={health} set={setHealth} count={counts()?.health.danger} />
        </Section>
        <Section title={ctx.t("version")}>
          <Option label={ctx.t("any")} value={null} current={opencode} set={setOpencode} />
          <Option label="V2" value="v2" current={opencode} set={setOpencode} count={counts()?.opencode.v2} />
          <Option label="V1" value="v1" current={opencode} set={setOpencode} count={counts()?.opencode.v1} />
          <Option label={ctx.t("unstated")} value="none" current={opencode} set={setOpencode} count={counts()?.opencode.none} />
        </Section>
        <Section title={ctx.t("recent")}>
          <Option label={ctx.t("any")} value={null} current={days} set={setDays} />
          <Option label={ctx.t("d7")} value={7} current={days} set={setDays} count={counts()?.days.d7} />
          <Option label={ctx.t("d30")} value={30} current={days} set={setDays} count={counts()?.days.d30} />
          <Option label={ctx.t("d180")} value={180} current={days} set={setDays} count={counts()?.days.d180} />
        </Section>
        <Section title={ctx.t("starsTitle")}>
          <Option label={ctx.t("any")} value={null} current={minStars} set={setMinStars} />
          <Option label="10+" value={10} current={minStars} set={setMinStars} count={counts()?.stars.s10} />
          <Option label="100+" value={100} current={minStars} set={setMinStars} count={counts()?.stars.s100} />
          <Option label="1000+" value={1000} current={minStars} set={setMinStars} count={counts()?.stars.s1000} />
        </Section>
      </ctx.ui.Dialog>
    ))

  return (
    <div style={{ "padding-top": "20px" }}>
      <div style={{ display: "flex", "align-items": "baseline", gap: "6px", "font-size": "12px", opacity: 0.5, "margin-bottom": "16px" }}>
        <span>{ctx.t("source")}</span>
        <a
          href="https://www.opendock.net/zh/plugins/"
          target="_blank"
          rel="noreferrer"
          style={{ color: "inherit", "text-decoration": "underline" }}
        >
          opendock.net
        </a>
        <span>· {ctx.t("catalog")} {at() ? new Date(at()).toLocaleString() : "-"}</span>
      </div>
      <div style={{ display: "flex", gap: "8px", "align-items": "flex-end", "margin-bottom": "6px" }}>
        <div style={{ flex: 1 }}>
          <ctx.ui.TextInput
            type="search"
            label={ctx.t("search")}
            placeholder={ctx.t("searchHint")}
            value={query()}
            onInput={(value) => setQuery(value)}
            onSubmit={() => void load()}
          />
        </div>
        <ctx.ui.Button variant={active() ? "contrast" : "neutral"} onClick={openFilters}>
          {active() ? `${ctx.t("filters")} (${active()})` : ctx.t("filters")}
        </ctx.ui.Button>
        <ctx.ui.Button variant={installedOnly() ? "contrast" : "neutral"} onClick={() => { setInstalledOnly(!installedOnly()); void load() }}>
          {ctx.t("installedOnly")}
        </ctx.ui.Button>
        <ctx.ui.Tooltip value={ctx.t("refresh")}>
          <ctx.ui.IconButton icon="outline-rotate-clockwise" label={ctx.t("refresh")} onClick={() => void load()} />
        </ctx.ui.Tooltip>
      </div>

      <div style={{ display: "flex", gap: "4px", "flex-wrap": "wrap", "align-items": "center", "font-size": "12px", opacity: 0.6, margin: "0 0 8px" }}>
        <span style={{ "margin-right": "6px" }}>
          {total()} {ctx.t("pluginsUnit")}
        </span>
        <Show when={category()}>
          {(id) => <Chip label={categories().find((item) => item.id === id())?.label ?? id()} clear={() => setCategory(null)} />}
        </Show>
        <Show when={health()}>{(value) => <Chip label={value()} clear={() => setHealth(null)} />}</Show>
        <Show when={opencode()}>{(value) => <Chip label={`V:${value()}`} clear={() => setOpencode(null)} />}</Show>
        <Show when={days()}>{(value) => <Chip label={`${value()}d`} clear={() => setDays(null)} />}</Show>
        <Show when={minStars()}>{(value) => <Chip label={`★${value()}+`} clear={() => setMinStars(null)} />}</Show>
      </div>

      <Show when={error()}>
        {(message) => <div style={{ color: "var(--color-danger, #d33)", "font-size": "13px", margin: "8px 0" }}>{message()}</div>}
      </Show>

      <Show when={!loading()} fallback={<ctx.ui.Loader />}>
        <For each={rows()}>
          {(entry) => (
            <div
              style={{
                display: "flex",
                gap: "12px",
                padding: "10px 0",
                "border-bottom": "1px solid color-mix(in srgb, currentColor 10%, transparent)",
              }}
            >
              <div style={{ flex: 1, "min-width": 0 }}>
                <div style={{ display: "flex", "align-items": "baseline", gap: "8px", "flex-wrap": "wrap" }}>
                  <span style={{ "font-weight": 500 }}>{entry.title}</span>
                  <Show when={entry.opencode && entry.opencode !== "v2" && entry.opencode !== "both"}>
                    <span style={{ "font-size": "11px", padding: "0 5px", "border-radius": "4px", background: "color-mix(in srgb, #d33 15%, transparent)" }}>
                      {entry.opencode}
                    </span>
                  </Show>
                  <Show when={entry.health === "danger"}>
                    <span style={{ "font-size": "11px", opacity: 0.7 }}>{ctx.t("risky")}</span>
                  </Show>
                </div>
                <div style={{ "font-size": "12px", opacity: 0.6, overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
                  {entry.description}
                </div>
                <div style={{ "font-size": "11px", opacity: 0.45, "margin-top": "2px" }}>
                  {entry.name} · ★{compact(entry.stars)} · {compact(entry.downloads)}/{ctx.t("month")} ·{" "}
                  {categories().find((item) => item.id === entry.category)?.label ?? entry.category}
                </div>
              </div>
              <ctx.ui.Button
                size="small"
                variant={entry.installed ? "neutral" : "contrast"}
                busy={busy() === entry.name}
                onClick={() => pick(entry)}
              >
                {entry.installed ? ctx.t("uninstall") : ctx.t("install")}
              </ctx.ui.Button>
            </div>
          )}
        </For>
        <Show when={rows().length < total()}>
          <div style={{ display: "flex", "justify-content": "center", margin: "12px 0" }}>
            <ctx.ui.Button size="small" busy={more()} onClick={() => void load(true)}>
              {ctx.t("more")}
            </ctx.ui.Button>
          </div>
        </Show>
      </Show>
    </div>
  )
}
