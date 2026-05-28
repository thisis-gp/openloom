import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, rmSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { SkillStore } from "../../src/skill/skill-store"

const TEST_GLOBAL = join(tmpdir(), `skill-global-${Date.now()}`)
const TEST_PROJECT_DIR = join(tmpdir(), `skill-project-${Date.now()}`)

describe("SkillStore", () => {
  let store: SkillStore

  beforeEach(() => {
    mkdirSync(TEST_GLOBAL, { recursive: true })
    mkdirSync(TEST_PROJECT_DIR, { recursive: true })
    store = new SkillStore(TEST_GLOBAL, TEST_PROJECT_DIR)
  })

  afterEach(() => {
    rmSync(TEST_GLOBAL, { recursive: true, force: true })
    rmSync(TEST_PROJECT_DIR, { recursive: true, force: true })
  })

  it("writes a global skill to ~/.agents/skills/<name>/SKILL.md", () => {
    store.write({
      name: "git-workflow",
      scope: "global",
      description: "Best practices for git branching",
      body: "## Git Workflow\n\nAlways create feature branches.",
    })
    const skillPath = join(TEST_GLOBAL, "git-workflow", "SKILL.md")
    expect(existsSync(skillPath)).toBe(true)
    const content = readFileSync(skillPath, "utf8")
    expect(content).toContain("git-workflow")
    expect(content).toContain("Always create feature branches")
  })

  it("writes a project skill to <project>/.agents/skills/<name>/SKILL.md", () => {
    store.write({
      name: "openloom-testing",
      scope: "project",
      description: "Testing patterns for openloom",
      body: "## Testing\n\nUse bun:test for all tests.",
    })
    const skillPath = join(TEST_PROJECT_DIR, ".agents", "skills", "openloom-testing", "SKILL.md")
    expect(existsSync(skillPath)).toBe(true)
  })

  it("includes frontmatter in written skill", () => {
    store.write({
      name: "git-workflow",
      scope: "global",
      description: "Git workflow guide",
      body: "Content here.",
    })
    const content = readFileSync(join(TEST_GLOBAL, "git-workflow", "SKILL.md"), "utf8")
    expect(content).toContain("---")
    expect(content).toContain("name: git-workflow")
    expect(content).toContain("scope: global")
    expect(content).toContain("created_by: curator")
  })

  it("lists all skills in the global store", () => {
    store.write({ name: "skill-a", scope: "global", description: "A", body: "A content" })
    store.write({ name: "skill-b", scope: "global", description: "B", body: "B content" })
    const skills = store.listGlobal()
    expect(skills.map(s => s.name).sort()).toEqual(["skill-a", "skill-b"])
  })

  it("reads a skill by name from the global store", () => {
    store.write({ name: "my-skill", scope: "global", description: "My skill", body: "Do this." })
    const skill = store.read("my-skill", "global")
    expect(skill).not.toBeNull()
    expect(skill?.body).toContain("Do this.")
  })

  it("updates an existing skill by appending to body", () => {
    store.write({ name: "my-skill", scope: "global", description: "My skill", body: "Original content." })
    store.update("my-skill", "global", "Additional content added by curator.")
    const skill = store.read("my-skill", "global")
    expect(skill?.body).toContain("Original content.")
    expect(skill?.body).toContain("Additional content added by curator.")
  })
})
