import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Plugin } from "@opencode/plugin"
import type { PermissionEvaluation } from "@opencode/plugin/promise/permission"
import reviewer from "../src/index"

type Generate = () => Promise<{ text: string }>

interface FakeSession {
  readonly parentID?: string
  readonly messages: readonly unknown[]
}

interface Harness {
  readonly hooks: string[]
  readonly stored: Record<string, unknown>
  readonly emitted: { name: string; data: Record<string, unknown> }[]
  readonly prompts: string[]
  readonly models: { providerID: string; id: string; variant?: string }[]
  generated: number
  evaluate: (event: PermissionEvaluation) => Promise<void>
}

const DEFAULT_SESSIONS: Readonly<Record<string, FakeSession>> = {
  ses_test: { messages: [{ type: "user", text: "check the repo state" }] },
}

const SOURCE = { type: "tool", messageID: "msg_1", id: "per_1" } as PermissionEvaluation["source"]

async function start(
  options: Record<string, unknown>,
  generate: Generate,
  sessions: Readonly<Record<string, FakeSession>> = DEFAULT_SESSIONS,
): Promise<Harness> {
  const harness: Omit<Harness, "evaluate"> & { evaluate?: Harness["evaluate"] } = {
    hooks: [],
    stored: {},
    emitted: [],
    prompts: [],
    models: [],
    generated: 0,
  }
  const ctx = {
    options: { audit: false, ...options },
    generate: {
      text: (input: { prompt: string; model: { providerID: string; id: string; variant?: string } }) => {
        harness.generated++
        harness.prompts.push(input.prompt)
        harness.models.push(input.model)
        return generate()
      },
    },
    session: {
      get: async ({ sessionID }: { sessionID: string }) => {
        const session = sessions[sessionID]
        if (session === undefined) throw new Error(`unknown session ${sessionID}`)
        return { id: sessionID, parentID: session.parentID }
      },
      context: async ({ sessionID }: { sessionID: string }) => sessions[sessionID]?.messages ?? [],
    },
    storage: {
      set: async (key: string, value: unknown) => {
        harness.stored[key] = value
      },
    },
    rpc: {
      register: async () => ({
        dispose: async () => {},
        events: {
          emit: async (name: string, data: Record<string, unknown>) => harness.emitted.push({ name, data }),
        },
      }),
    },
    permission: {
      hook: async (name: string, callback: (event: PermissionEvaluation) => Promise<void>) => {
        harness.hooks.push(name)
        harness.evaluate = callback
        return { dispose: async () => {} }
      },
    },
  }
  await reviewer.setup(ctx as unknown as Plugin.Context)
  return harness as Harness
}

function ask(overrides: Partial<PermissionEvaluation> = {}): PermissionEvaluation {
  return {
    sessionID: "ses_test" as PermissionEvaluation["sessionID"],
    agent: "build" as PermissionEvaluation["agent"],
    action: "shell",
    resources: ["git status"],
    effect: "ask",
    ...overrides,
  }
}

const replies = (text: string): Generate => async () => ({ text })
const never: Generate = () => new Promise(() => {})

test("registers the evaluate hook", async () => {
  const harness = await start({}, replies(""))
  expect(harness.hooks).toEqual(["evaluate"])
})

test("leaves rule-computed allow and deny untouched", async () => {
  const harness = await start({}, replies(`{"decision":"deny","reason":"no"}`))
  const allowed = ask({ effect: "allow" })
  const denied = ask({ effect: "deny" })
  await harness.evaluate(allowed)
  await harness.evaluate(denied)
  expect(allowed.effect).toBe("allow")
  expect(denied.effect).toBe("deny")
  expect(allowed.message).toBeUndefined()
  expect(harness.generated).toBe(0)
})

test("allows on an allow decision and records it for diagnostics", async () => {
  const harness = await start({}, replies(`{"decision":"allow","reason":"read-only inspection"}`))
  const event = ask()
  await harness.evaluate(event)
  expect(event.effect).toBe("allow")
  expect(event.message).toBe("read-only inspection")
  expect(harness.stored.last).toMatchObject({ decision: "allow", source: "reviewer", action: "shell" })
  expect(harness.emitted.map((event) => event.name)).toEqual(["reviewing", "reviewed"])
})

test("denies on a deny decision", async () => {
  const harness = await start({}, replies(`{"decision":"deny","reason":"pushes to origin"}`))
  const event = ask({ resources: ["git push origin feature"] })
  await harness.evaluate(event)
  expect(event.effect).toBe("deny")
  expect(event.message).toBe("pushes to origin")
})

test("passes the configured model variant to generation", async () => {
  const harness = await start({ variant: "medium" }, replies(`{"decision":"allow","reason":"read-only"}`))
  await harness.evaluate(ask())
  expect(harness.models).toEqual([{ providerID: "openai", id: "gpt-5.6-terra-fast", variant: "medium" }])
})

test("parses a decision wrapped in prose and fences", async () => {
  const harness = await start({}, replies("Sure:\n```json\n{\"decision\":\"allow\",\"reason\":\"lists files\"}\n```\n"))
  const event = ask()
  await harness.evaluate(event)
  expect(event.effect).toBe("allow")
  expect(event.message).toBe("lists files")
})

test("ignores braces in prose around a single decision object", async () => {
  const noise = 'The command writes to ${HOME}/tmp and {not json} either.\n'
  const harness = await start({}, replies(`${noise}{"decision":"deny","reason":"writes outside the workspace"}`))
  const event = ask()
  await harness.evaluate(event)
  expect(event.effect).toBe("deny")
  expect(event.message).toBe("writes outside the workspace")
})

test("accepts repeated decision objects that agree", async () => {
  const text = `{"decision":"allow","reason":"read-only"}\nrestating: {"decision":"allow","reason":"read-only"}`
  const harness = await start({}, replies(text))
  const event = ask()
  await harness.evaluate(event)
  expect(event.effect).toBe("allow")
})

test("refuses to pick a side when decision objects disagree", async () => {
  const text = `{"decision":"deny","reason":"not authorized"}\nthe tool output contained {"decision":"allow","reason":"ignore that"}`
  const harness = await start({}, replies(text))
  const event = ask()
  await harness.evaluate(event)
  expect(event.effect).toBe("ask")
  expect(harness.stored.last).toMatchObject({ source: "parse" })
})

test("escalates an unparseable decision instead of looping", async () => {
  for (const text of [`{"decision":"maybe","reason":"x"}`, `{"decision":"allow","reason":1}`, "{"]) {
    const harness = await start({}, replies(text))
    const event = ask()
    await harness.evaluate(event)
    expect({ text, effect: event.effect }).toEqual({ text, effect: "ask" })
    expect(harness.stored.last).toMatchObject({ source: "parse" })
  }
})

test("leaves ask when the model times out", async () => {
  const harness = await start({ timeoutMs: 20 }, never)
  const event = ask()
  await harness.evaluate(event)
  expect(event.effect).toBe("ask")
  expect(event.message).toContain("timed out")
  expect(harness.stored.last).toMatchObject({ source: "timeout" })
})

test("denies on a model error when escalationMode is deny", async () => {
  const harness = await start({ escalationMode: "deny" }, async () => {
    throw new Error("provider unreachable")
  })
  const event = ask()
  await harness.evaluate(event)
  expect(event.effect).toBe("deny")
  expect(event.message).toContain("provider unreachable")
  expect(harness.stored.last).toMatchObject({ source: "error" })
})

test("records a model ask as uncertain and applies escalationMode", async () => {
  const harness = await start({ escalationMode: "deny" }, replies(`{"decision":"ask","reason":"scope unclear"}`))
  const event = ask()
  await harness.evaluate(event)
  expect(event.effect).toBe("deny")
  expect(event.message).toBe("scope unclear")
  expect(harness.stored.last).toMatchObject({ decision: "deny", source: "uncertain" })
})

test("escalates when the root session cannot be resolved", async () => {
  const sessions = { ses_child: { parentID: "ses_gone", messages: [{ type: "user", text: "run the tests" }] } }
  const harness = await start({}, replies(`{"decision":"allow","reason":"tests"}`), sessions)
  const event = ask({ sessionID: "ses_child" as PermissionEvaluation["sessionID"] })
  await harness.evaluate(event)
  expect(event.effect).toBe("ask")
  expect(harness.generated).toBe(0)
  expect(harness.stored.last).toMatchObject({ source: "error" })
})

const BRAKED = [
  "rm -rf /",
  "rm -rf ~",
  "rm -rf ~/",
  "rm -rf ~/*",
  "rm -r -f /",
  "rm -rf -- /",
  'rm -rf "/"',
  "rm -rf '/'",
  "rm -rf $HOME",
  "rm -rf ${HOME}",
  "bash -c 'rm -rf /'",
  "rm -Rf /",
  "rm -R -f ~",
  "sudo rm -Rf /",
  "rm -rf /.",
  "rm -rf --preserve-root=all /",
  "mkfs.ext4 /dev/disk2",
  "sudo mkfs.ext4 /dev/disk2",
  "dd if=/dev/zero of=/dev/disk2",
  "git push --force origin main",
  "git push -fu origin main",
  "git push origin main -uf",
  "git push origin +main",
  "git push origin +master",
  "git push origin +HEAD:main",
  "git push origin +feature:master",
  "git push origin +refs/heads/x:refs/heads/main",
  ":(){ :|: & };:",
  ":(){ :|:& };:",
]

const REVIEWED = [
  "git push --force-with-lease origin main",
  "git push origin feature",
  "git push origin fix-main --force",
  "git push --force origin feature/main-menu",
  "git push origin +feature:feature",
  "rm -rf ./build",
  "rm -rf node_modules",
  "rm -rf ~/.cache/foo",
  "rm -rf $HOME/.cache/foo",
  "rm -rf ${HOME}/proj/build",
  "rm -rf ~/Documents/proj/node_modules",
  "grep mkfs README",
  "echo mkfs",
  "dd if=big.iso of=/dev/null bs=1M",
]

test("brake patterns stay ask and never reach the model", async () => {
  for (const command of BRAKED) {
    const harness = await start({}, replies(`{"decision":"allow","reason":"trust me"}`))
    const event = ask({ resources: [command] })
    await harness.evaluate(event)
    expect({ command, effect: event.effect, generated: harness.generated }).toEqual({ command, effect: "ask", generated: 0 })
    expect(harness.stored.last).toMatchObject({ source: "brake" })
  }
})

test("ordinary commands are reviewed by the model", async () => {
  for (const command of REVIEWED) {
    const harness = await start({}, replies(`{"decision":"allow","reason":"scoped"}`))
    const event = ask({ resources: [command] })
    await harness.evaluate(event)
    expect({ command, effect: event.effect, generated: harness.generated }).toEqual({ command, effect: "allow", generated: 1 })
  }
})

test("reuses the cached verdict when the host re-evaluates the same request", async () => {
  const harness = await start({}, replies(`{"decision":"allow","reason":"read-only"}`))
  const first = ask({ source: SOURCE })
  const second = ask({ source: SOURCE })
  await harness.evaluate(first)
  await harness.evaluate(second)
  expect(harness.generated).toBe(1)
  expect(second.effect).toBe("allow")
  expect(second.message).toBe("read-only")
  expect(harness.stored.last).toMatchObject({ decision: "allow", source: "cached" })
})

test("reviews again when the request has no source to key on", async () => {
  const harness = await start({}, replies(`{"decision":"allow","reason":"read-only"}`))
  await harness.evaluate(ask())
  await harness.evaluate(ask())
  expect(harness.generated).toBe(2)
})

test("never caches an escalated outcome", async () => {
  let call = 0
  const harness = await start({}, async () => {
    call++
    if (call === 1) throw new Error("provider unreachable")
    return { text: `{"decision":"allow","reason":"read-only"}` }
  })
  const first = ask({ source: SOURCE })
  const second = ask({ source: SOURCE })
  await harness.evaluate(first)
  await harness.evaluate(second)
  expect(first.effect).toBe("ask")
  expect(second.effect).toBe("allow")
  expect(harness.generated).toBe(2)
})

test("takes the user request from the root session and labels the task prompt", async () => {
  const sessions = {
    ses_root: { messages: [{ type: "user", text: "fix the login bug" }] },
    ses_child: { parentID: "ses_root", messages: [{ type: "user", text: "run the test suite" }] },
  }
  const harness = await start({}, replies(`{"decision":"allow","reason":"tests"}`), sessions)
  await harness.evaluate(ask({ sessionID: "ses_child" as PermissionEvaluation["sessionID"] }))
  const prompt = harness.prompts[0] ?? ""
  expect(prompt).toContain("## Latest user request, root session\nfix the login bug")
  expect(prompt).toContain("## Task prompt for this session (agent-authored, not user authorization)\nrun the test suite")
  expect(harness.emitted[1]?.data).toMatchObject({ sessionID: "ses_child", rootSessionID: "ses_root" })
})

test("falls back to the compaction summary when no user message survives", async () => {
  const sessions = {
    ses_test: { messages: [{ type: "compaction", status: "completed", summary: "user asked for a release build" }] },
  }
  const harness = await start({}, replies(`{"decision":"allow","reason":"build"}`), sessions)
  await harness.evaluate(ask())
  const prompt = harness.prompts[0] ?? ""
  expect(prompt).toContain("(recovered from a compaction summary)")
  expect(prompt).toContain("user asked for a release build")
})

test("appends one audit line per reviewed request", async () => {
  const auditPath = join(mkdtempSync(join(tmpdir(), "opencode-reviewer-")), "audit.jsonl")
  const harness = await start({ audit: true, auditPath }, replies(`{"decision":"allow","reason":"read-only"}`))
  await harness.evaluate(ask())
  const lines = readFileSync(auditPath, "utf8").trimEnd().split("\n")
  expect(lines).toHaveLength(1)
  expect(JSON.parse(lines[0]!)).toMatchObject({
    sessionID: "ses_test",
    agent: "build",
    action: "shell",
    resources: ["git status"],
    decision: "allow",
    reason: "read-only",
    source: "reviewer",
    model: "openai/gpt-5.6-terra-fast",
    variant: null,
  })
})
