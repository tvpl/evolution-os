import { randomUUID, createHash, createPrivateKey, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import type { DbPool } from "../platform/db.js";
import { withTx } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";
import { canonicalJson } from "../platform/canonical-json.js";
import type { Queryable } from "../policy/policy.js";

export const COMPONENT_TYPES = [
  "sensor",
  "analyzer",
  "skill",
  "policyPack",
  "connector",
  "mcpAdapter",
  "executor",
  "uiContribution",
  "ontologyExtension",
  "evalPack",
  "transformation",
] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

export interface ModuleComponent {
  id: string;
  type: ComponentType;
  capabilities: string[];
}

export interface ModuleManifest {
  id: string;
  version: string;
  publisher: string;
  name?: string;
  components: ModuleComponent[];
  [key: string]: unknown;
}

/** MODL-04: validador determinístico - checa forma, nunca executa código do módulo. */
export function isValidManifest(value: unknown): value is ModuleManifest {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  if (typeof m.id !== "string" || m.id.length === 0) return false;
  if (typeof m.version !== "string" || !SEMVER_RE.test(m.version)) return false;
  if (typeof m.publisher !== "string" || m.publisher.length === 0) return false;
  if (!Array.isArray(m.components) || m.components.length === 0) return false;

  const seenIds = new Set<string>();
  for (const raw of m.components) {
    if (!raw || typeof raw !== "object") return false;
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== "string" || c.id.length === 0) return false;
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    if (!COMPONENT_TYPES.includes(c.type as ComponentType)) return false;
    if (c.capabilities !== undefined) {
      if (!Array.isArray(c.capabilities)) return false;
      if (!c.capabilities.every((cap) => typeof cap === "string")) return false;
    }
  }
  return true;
}

/** MODL-01: mesmo formato "sha256:<hex>" de `registry.ts::canonicalDigest`, sobre o `canonicalJson` do Slice 4. */
export function computeManifestDigest(manifest: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(canonicalJson(manifest)).digest("hex")}`;
}

function signDigest(digest: string, privateKeyDerB64: string): string {
  const privateKey = createPrivateKey({ key: Buffer.from(privateKeyDerB64, "base64"), format: "der", type: "pkcs8" });
  return cryptoSign(null, Buffer.from(digest, "utf8"), privateKey).toString("base64");
}

/** Gera (na primeira publicação do org) ou reusa o par de chaves Ed25519 - ver design.md Risks & Concerns. */
async function getOrCreatePublisherKey(
  db: Queryable,
  orgId: string,
): Promise<{ publicKey: string; privateKey: string }> {
  const existing = await db.query(
    `select public_key as "publicKey", private_key as "privateKey" from module_publisher_keys where org_id = $1`,
    [orgId],
  );
  if (existing.rows[0]) return existing.rows[0] as { publicKey: string; privateKey: string };

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const privateKeyB64 = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  await db.query(
    `insert into module_publisher_keys (org_id, public_key, private_key) values ($1, $2, $3)
     on conflict (org_id) do nothing`,
    [orgId, publicKeyB64, privateKeyB64],
  );
  const row = await db.query(
    `select public_key as "publicKey", private_key as "privateKey" from module_publisher_keys where org_id = $1`,
    [orgId],
  );
  return row.rows[0] as { publicKey: string; privateKey: string };
}

export interface Sbom {
  sbomFormat: "evolutionos-sbom-v0";
  moduleId: string;
  version: string;
  components: Array<{ id: string; type: string; capabilities: string[] }>;
}

function buildSbom(m: ModuleManifest): Sbom {
  return {
    sbomFormat: "evolutionos-sbom-v0",
    moduleId: m.id,
    version: m.version,
    components: m.components.map((c) => ({ id: c.id, type: c.type, capabilities: c.capabilities ?? [] })),
  };
}

export type PublishModuleOutcome =
  | { kind: "published"; moduleId: string; version: string; digest: string; signature: string; sbom: Sbom }
  | { kind: "invalid" }
  | { kind: "conflict" };

/** MODL-01/02/03: publica, reusando a versão existente por replay se o digest já publicado for idêntico. */
export async function publishModule(
  pool: DbPool,
  scope: AuthScope,
  manifest: unknown,
): Promise<PublishModuleOutcome> {
  if (!isValidManifest(manifest)) return { kind: "invalid" };
  const m = manifest;
  const digest = computeManifestDigest(m as unknown as Record<string, unknown>);

  return withTx(pool, async (client) => {
    const existingModule = await client.query(`select org_id from modules where id = $1`, [m.id]);
    const moduleRow = existingModule.rows[0] as { org_id: string } | undefined;
    if (moduleRow && moduleRow.org_id !== scope.orgId) {
      return { kind: "conflict" };
    }
    if (!moduleRow) {
      await client.query(`insert into modules (id, org_id, name) values ($1, $2, $3)`, [
        m.id,
        scope.orgId,
        m.name ?? m.id,
      ]);
    }

    const existingVersion = await client.query(
      `select digest, signature, sbom from module_versions where module_id = $1 and version = $2`,
      [m.id, m.version],
    );
    const versionRow = existingVersion.rows[0] as { digest: string; signature: string; sbom: Sbom } | undefined;
    if (versionRow) {
      if (versionRow.digest !== digest) return { kind: "conflict" };
      return {
        kind: "published",
        moduleId: m.id,
        version: m.version,
        digest,
        signature: versionRow.signature,
        sbom: versionRow.sbom,
      };
    }

    const { privateKey } = await getOrCreatePublisherKey(client, scope.orgId);
    const signature = signDigest(digest, privateKey);
    const sbom = buildSbom(m);
    const provenance = { publisherOrgId: scope.orgId, publishedAt: new Date().toISOString() };
    const id = `mv_${randomUUID().replaceAll("-", "")}`;
    await client.query(
      `insert into module_versions (id, module_id, org_id, version, manifest, digest, signature, sbom, provenance)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, m.id, scope.orgId, m.version, JSON.stringify(m), digest, signature, JSON.stringify(sbom), JSON.stringify(provenance)],
    );
    return { kind: "published", moduleId: m.id, version: m.version, digest, signature, sbom };
  });
}
