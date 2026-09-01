import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectSnapshot } from "../../src/snapshot.js";

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "snapshot-test-"));
  mkdirSync(join(dir, ".git", "refs", "heads"), { recursive: true });
  writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(join(dir, ".git", "refs", "heads", "main"), "a".repeat(40) + "\n");
  return dir;
}

describe("collectSnapshot (TWIN-01/02/04)", () => {
  it("a git repo with package.json yields branch, sha, manifest and language histogram", () => {
    const dir = makeRepo();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "meu-pacote" }));
    writeFileSync(join(dir, "index.ts"), "export {}");
    writeFileSync(join(dir, "README.md"), "# readme");

    const result = collectSnapshot(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.branch).toBe("main");
    expect(result.snapshot.commitSha).toBe("a".repeat(40));
    expect(result.snapshot.manifests).toEqual([
      { ecosystem: "npm", location: ".", name: "meu-pacote" },
    ]);
    expect(result.snapshot.languages).toMatchObject({ TypeScript: 1, Markdown: 1 });
  });

  it("payload never includes file content beyond manifest-declared names", () => {
    const dir = makeRepo();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "pkg", secretField: "should-not-leak" }));
    writeFileSync(join(dir, "app.ts"), "const secret = 'sk-super-secret-token';");

    const result = collectSnapshot(dir);
    expect(result.ok).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("should-not-leak");
    expect(serialized).not.toContain("sk-super-secret-token");
  });

  it("a directory without .git returns a structured error, never throws", () => {
    const dir = mkdtempSync(join(tmpdir(), "no-git-"));
    const result = collectSnapshot(dir);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("not a git repository") });
  });

  it("a repo with no recognized manifest succeeds with an empty manifest list", () => {
    const dir = makeRepo();
    writeFileSync(join(dir, "notes.md"), "docs only");
    const result = collectSnapshot(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.manifests).toEqual([]);
  });

  it("nested manifests in subdirectories are located with the correct relative path", () => {
    const dir = makeRepo();
    mkdirSync(join(dir, "packages", "api"), { recursive: true });
    writeFileSync(join(dir, "packages", "api", "package.json"), JSON.stringify({ name: "api" }));
    const result = collectSnapshot(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.manifests).toEqual([
      { ecosystem: "npm", location: join("packages", "api"), name: "api" },
    ]);
  });

  it("ignored directories (node_modules) are excluded from the walk", () => {
    const dir = makeRepo();
    mkdirSync(join(dir, "node_modules", "some-dep"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "some-dep", "package.json"), JSON.stringify({ name: "dep" }));
    const result = collectSnapshot(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.manifests).toEqual([]);
  });

  it("a detached HEAD resolves the commit sha with a null branch", () => {
    const dir = mkdtempSync(join(tmpdir(), "snapshot-detached-"));
    mkdirSync(join(dir, ".git"), { recursive: true });
    writeFileSync(join(dir, ".git", "HEAD"), "b".repeat(40) + "\n");
    const result = collectSnapshot(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot).toMatchObject({ branch: null, commitSha: "b".repeat(40) });
  });
});
