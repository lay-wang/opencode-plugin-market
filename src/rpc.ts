import { Rpc } from "@opencode/plugin/rpc"

const nullable = (type: "string" | "number") => ({ anyOf: [{ type }, { type: "null" }] })

const Entry = {
  type: "object",
  properties: {
    name: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    stars: { type: "number" },
    downloads: { type: "number" },
    score: { type: "number" },
    category: { type: "string" },
    opencode: nullable("string"),
    health: { type: "string" },
    pushedAt: { type: "number" },
    installed: { type: "boolean" },
  },
  required: ["name", "title", "description", "stars", "downloads", "score", "category", "opencode", "health", "pushedAt", "installed"],
  additionalProperties: false,
} as const

const Result = {
  type: "object",
  properties: { ok: { type: "boolean" }, error: nullable("string") },
  required: ["ok", "error"],
  additionalProperties: false,
} as const

const Name = {
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"],
  additionalProperties: false,
} as const

export const Market = Rpc.define({
  id: "plugin-market",
  methods: {
    market: {
      input: {
        type: "object",
        properties: {
          query: { type: "string" },
          installed: { type: "boolean" },
          category: nullable("string"),
          health: nullable("string"),
          opencode: nullable("string"),
          days: nullable("number"),
          minStars: nullable("number"),
          offset: { type: "number" },
          limit: { type: "number" },
        },
        required: ["query", "installed", "category", "health", "opencode", "days", "minStars", "offset", "limit"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          at: { type: "number" },
          total: { type: "number" },
          items: { type: "array", items: Entry },
          categories: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "string" }, label: { type: "string" }, count: { type: "number" } },
              required: ["id", "label", "count"],
              additionalProperties: false,
            },
          },
          counts: {
            type: "object",
            properties: {
              health: {
                type: "object",
                properties: { ok: { type: "number" }, warn: { type: "number" }, danger: { type: "number" } },
                required: ["ok", "warn", "danger"],
                additionalProperties: false,
              },
              opencode: {
                type: "object",
                properties: { v2: { type: "number" }, v1: { type: "number" }, none: { type: "number" } },
                required: ["v2", "v1", "none"],
                additionalProperties: false,
              },
              days: {
                type: "object",
                properties: { d7: { type: "number" }, d30: { type: "number" }, d180: { type: "number" } },
                required: ["d7", "d30", "d180"],
                additionalProperties: false,
              },
              stars: {
                type: "object",
                properties: { s10: { type: "number" }, s100: { type: "number" }, s1000: { type: "number" } },
                required: ["s10", "s100", "s1000"],
                additionalProperties: false,
              },
            },
            required: ["health", "opencode", "days", "stars"],
            additionalProperties: false,
          },
        },
        required: ["at", "total", "items", "categories", "counts"],
        additionalProperties: false,
      },
    },
    install: { input: Name, output: Result },
    uninstall: { input: Name, output: Result },
  },
  events: {},
})
