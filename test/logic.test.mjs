import assert from "node:assert/strict"
import { localSpec, newer, samePackage } from "../src/logic.ts"

const cases = [
  ["newer: a patch ahead", newer("0.49.45", "0.49.42"), true],
  ["newer: equal", newer("5.3.3", "5.3.3"), false],
  ["newer: behind", newer("1.0.0", "1.0.1"), false],
  ["newer: minor ahead", newer("0.2.1", "0.1.0"), true],
  ["newer: numeric not lexical", newer("5.10.0", "5.9.9"), true],
  ["newer: pre-release is not ahead", newer("0.0.0-stage", "0.1.0"), false],
  ["samePackage: identical", samePackage("opencode-tavily", "opencode-tavily"), true],
  ["samePackage: prefix dropped, same scope", samePackage("@cortexkit/opencode-magic-context", "@cortexkit/magic-context"), true],
  ["samePackage: other scope", samePackage("@prevalentware/opencode-goal-plugin", "opencode-goal-plugin"), false],
  ["samePackage: other owner, same tail", samePackage("opencode-tavily", "@other/tavily"), false],
  ["localSpec: absolute dir", localSpec("/Users/x/plugin"), true],
  ["localSpec: npm name", localSpec("@scope/name"), false],
  ["localSpec: git url", localSpec("git+https://github.com/x/y"), true],
]

for (const [name, got, want] of cases) assert.equal(got, want, name)
console.log(`${cases.length} checks passed`)
