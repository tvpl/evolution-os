import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

export interface ManifestEntry {
  ecosystem: string;
  location: string;
  name: string | null;
}

export interface SnapshotPayload {
  branch: string | null;
  commitSha: string | null;
  manifests: ManifestEntry[];
  languages: Record<string, number>;
}

export type CollectResult = { ok: true; snapshot: SnapshotPayload } | { ok: false; error: string };

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", ".next", "build", "target", "vendor"]);

const MANIFEST_FILES: Record<string, string> = {
  "package.json": "npm",
  "pyproject.toml": "pypi",
  "go.mod": "go",
  "Cargo.toml": "cargo",
  "pom.xml": "maven",
};

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".rb": "Ruby",
  ".md": "Markdown",
  ".sql": "SQL",
};

function readManifestName(path: string, ecosystem: string): string | null {
  try {
    const content = readFileSync(path, "utf8");
    if (ecosystem === "npm") {
      const parsed = JSON.parse(content) as { name?: string };
      return parsed.name ?? null;
    }
    if (ecosystem === "cargo" || ecosystem === "pypi") {
      const match = content.match(/name\s*=\s*"([^"]+)"/);
      return match?.[1] ?? null;
    }
    if (ecosystem === "go") {
      const match = content.match(/^module\s+(\S+)/m);
      return match?.[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Caminha o repositório coletando manifests conhecidos e um histograma de linguagens por extensão. */
function walk(root: string, dir: string, manifests: ManifestEntry[], languages: Record<string, number>): void {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(root, full, manifests, languages);
      continue;
    }
    const ecosystem = MANIFEST_FILES[entry];
    if (ecosystem) {
      manifests.push({
        ecosystem,
        location: relative(root, dir) || ".",
        name: readManifestName(full, ecosystem),
      });
      continue;
    }
    const lang = LANGUAGE_BY_EXT[extname(entry)];
    if (lang) {
      languages[lang] = (languages[lang] ?? 0) + 1;
    }
  }
}

/**
 * Parse manual de `.git/HEAD` + refs (sem shell out a `git` — TWIN design).
 * Retorna null quando não resolvível (worktree incomum), nunca lança.
 */
function readGitHead(gitDir: string): { branch: string | null; commitSha: string | null } {
  try {
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    const refMatch = head.match(/^ref:\s*(.+)$/);
    if (!refMatch) {
      // HEAD detached: o próprio conteúdo já é o sha.
      return { branch: null, commitSha: /^[0-9a-f]{40}$/.test(head) ? head : null };
    }
    const refPath = refMatch[1] ?? "";
    const branch = refPath.replace(/^refs\/heads\//, "");
    const refFile = join(gitDir, refPath);
    if (existsSync(refFile)) {
      return { branch, commitSha: readFileSync(refFile, "utf8").trim() };
    }
    const packed = join(gitDir, "packed-refs");
    if (existsSync(packed)) {
      const line = readFileSync(packed, "utf8")
        .split("\n")
        .find((l) => l.endsWith(` ${refPath}`));
      const sha = line?.split(" ")[0] ?? null;
      return { branch, commitSha: sha };
    }
    return { branch, commitSha: null };
  } catch {
    return { branch: null, commitSha: null };
  }
}

/**
 * TWIN-01/02/04: coleta determinística e local — NUNCA lê conteúdo de
 * código-fonte além do nome declarado em manifests conhecidos (metadata-only,
 * ADR-015). Nunca lança: falhas viram `{ok:false}`.
 */
export function collectSnapshot(repoPath: string): CollectResult {
  const gitDir = join(repoPath, ".git");
  if (!existsSync(gitDir)) {
    return { ok: false, error: `${repoPath} is not a git repository (no .git directory)` };
  }
  const { branch, commitSha } = readGitHead(gitDir);
  const manifests: ManifestEntry[] = [];
  const languages: Record<string, number> = {};
  walk(repoPath, repoPath, manifests, languages);
  return { ok: true, snapshot: { branch, commitSha, manifests, languages } };
}
