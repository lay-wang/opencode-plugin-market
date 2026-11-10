/** Scope of an npm name: "@scope/name" -> "@scope", "name" -> "". */
export const scopeOf = (name: string) => (name.startsWith("@") ? name.split("/")[0] : "")

/** Name with the scope and an `opencode-` prefix removed. */
export const core = (name: string) => name.replace(/^@[^/]+\//, "").replace(/^opencode-/, "")

/**
 * Two names for the same package: identical, or the same scope with the same name once the `opencode-` prefix is
 * dropped. A different scope is a different package, never a match.
 */
export const samePackage = (a: string, b: string) => a === b || (scopeOf(a) === scopeOf(b) && core(a) === core(b))

/** A spec that does not come from the npm registry: a directory, a tarball, or a git URL. */
export const localSpec = (spec: string) => /^(\.|\/|~|file:|git\+|git:|github:|https?:)/.test(spec)

const parts = (version: string) => version.split(/[.+-]/).map((part) => (/^\d+$/.test(part) ? Number(part) : 0))

/** True when `latest` is a version ahead of `current`. Unparsable parts count as 0, so a pre-release is not newer. */
export const newer = (latest: string, current: string) => {
  const a = parts(latest)
  const b = parts(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0)
    if (delta !== 0) return delta > 0
  }
  return false
}
