import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, appendFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const DEFAULT_GLOBAL_DIR = join(homedir(), ".agents", "skills")

export interface SkillEntry {
  name: string
  scope: "global" | "project"
  description: string
  body: string
}

export interface SkillRecord {
  name: string
  scope: "global" | "project"
  description: string
  body: string
  createdAt: string
  lastUpdated: string
}

export class SkillStore {
  constructor(
    private readonly globalDir: string = DEFAULT_GLOBAL_DIR,
    private readonly projectDir: string = process.cwd(),
  ) {}

  private projectSkillsDir(): string {
    return join(this.projectDir, ".agents", "skills")
  }

  private skillDir(name: string, scope: "global" | "project"): string {
    const base = scope === "global" ? this.globalDir : this.projectSkillsDir()
    return join(base, name)
  }

  private skillPath(name: string, scope: "global" | "project"): string {
    return join(this.skillDir(name, scope), "SKILL.md")
  }

  private buildFrontmatter(entry: SkillEntry, now: string): string {
    return [
      "---",
      `name: ${entry.name}`,
      `description: ${entry.description}`,
      `scope: ${entry.scope}`,
      `created_by: curator`,
      `created_at: ${now}`,
      `last_updated: ${now}`,
      "---",
      "",
    ].join("\n")
  }

  write(entry: SkillEntry): string {
    const dir = this.skillDir(entry.name, entry.scope)
    mkdirSync(dir, { recursive: true })

    const now = new Date().toISOString()
    const content = this.buildFrontmatter(entry, now) + entry.body + "\n"
    const path = this.skillPath(entry.name, entry.scope)
    writeFileSync(path, content, "utf8")
    return path
  }

  read(name: string, scope: "global" | "project"): SkillRecord | null {
    const path = this.skillPath(name, scope)
    if (!existsSync(path)) return null

    const raw = readFileSync(path, "utf8")
    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n/)
    const body = frontmatterMatch ? raw.slice(frontmatterMatch[0].length) : raw

    const getField = (field: string): string => {
      const match = raw.match(new RegExp(`^${field}: (.+)$`, "m"))
      return match?.[1]?.trim() ?? ""
    }

    return {
      name: getField("name") || name,
      scope,
      description: getField("description"),
      body: body.trim(),
      createdAt: getField("created_at"),
      lastUpdated: getField("last_updated"),
    }
  }

  update(name: string, scope: "global" | "project", addition: string): void {
    const path = this.skillPath(name, scope)
    if (!existsSync(path)) {
      this.write({ name, scope, description: "", body: addition })
      return
    }
    appendFileSync(path, "\n\n" + addition + "\n", "utf8")
  }

  listGlobal(): Array<{ name: string }> {
    if (!existsSync(this.globalDir)) return []
    return readdirSync(this.globalDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => ({ name: d.name }))
  }

  listProject(): Array<{ name: string }> {
    const dir = this.projectSkillsDir()
    if (!existsSync(dir)) return []
    return readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => ({ name: d.name }))
  }
}
