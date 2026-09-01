import { randomUUID } from "node:crypto";
import type { DbPool } from "../platform/db.js";
import { withTx } from "../platform/db.js";
import type { AuthScope } from "../identity/session.js";

export const RELATION_TYPES = ["composition", "dependency", "implementation", "ownership", "influence"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export interface DeclareRelationInput {
  targetProjectId: string;
  type: string;
}

export type DeclareRelationOutcome =
  | { kind: "declared"; relationId: string }
  | { kind: "invalid_type" }
  | { kind: "self_relation" }
  | { kind: "not_found" };

/**
 * PORT-01/02/03/04: implementa `spec.relations` (CORE-FR-002) pela primeira
 * vez - o campo já existe no manifest schema desde o Slice 0, mas nunca foi
 * persistido/consultado por nenhum código do Hub até este slice.
 */
export async function declareRelation(
  pool: DbPool,
  scope: AuthScope,
  sourceProjectId: string,
  input: DeclareRelationInput,
): Promise<DeclareRelationOutcome> {
  if (!RELATION_TYPES.includes(input.type as RelationType)) return { kind: "invalid_type" };
  if (input.targetProjectId === sourceProjectId) return { kind: "self_relation" };

  const target = await pool.query("select org_id from projects where id = $1", [input.targetProjectId]);
  const targetRow = target.rows[0] as { org_id: string } | undefined;
  if (!targetRow || targetRow.org_id !== scope.orgId) return { kind: "not_found" };

  return withTx(pool, async (client) => {
    const existing = await client.query(
      `select id from project_relations where source_project_id = $1 and target_project_id = $2 and type = $3`,
      [sourceProjectId, input.targetProjectId, input.type],
    );
    const existingRow = existing.rows[0] as { id: string } | undefined;
    if (existingRow) return { kind: "declared", relationId: existingRow.id };

    const id = `rel_${randomUUID().replaceAll("-", "")}`;
    await client.query(
      `insert into project_relations (id, org_id, workspace_id, source_project_id, target_project_id, type)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (source_project_id, target_project_id, type) do nothing`,
      [id, scope.orgId, scope.workspaceId, sourceProjectId, input.targetProjectId, input.type],
    );
    const row = await client.query(
      `select id from project_relations where source_project_id = $1 and target_project_id = $2 and type = $3`,
      [sourceProjectId, input.targetProjectId, input.type],
    );
    return { kind: "declared", relationId: (row.rows[0] as { id: string }).id };
  });
}

export interface RelationRow {
  id: string;
  sourceProjectId: string;
  targetProjectId: string;
  type: string;
  createdAt: string;
}

export interface ProjectRelations {
  outbound: RelationRow[];
  inbound: RelationRow[];
}

export async function listRelations(pool: DbPool, projectId: string): Promise<ProjectRelations> {
  const outbound = await pool.query(
    `select id, source_project_id as "sourceProjectId", target_project_id as "targetProjectId", type, created_at as "createdAt"
       from project_relations where source_project_id = $1 order by created_at`,
    [projectId],
  );
  const inbound = await pool.query(
    `select id, source_project_id as "sourceProjectId", target_project_id as "targetProjectId", type, created_at as "createdAt"
       from project_relations where target_project_id = $1 order by created_at`,
    [projectId],
  );
  return { outbound: outbound.rows as RelationRow[], inbound: inbound.rows as RelationRow[] };
}

export interface DashboardMember {
  projectId: string;
  openProposalsCount: number;
  rejectedDecisionsCount: number;
  runningExperimentsCount: number;
}

/**
 * PORT-05/06/07: agrega contagens diretas e determinísticas dos membros
 * `composition` de um portfolio - nunca um "health score" ponderado (nenhuma
 * doc-fonte define pesos; ver design.md Out of Scope/Assumptions).
 */
export async function getPortfolioDashboard(pool: DbPool, portfolioProjectId: string): Promise<DashboardMember[]> {
  const members = await pool.query(
    `select target_project_id as "projectId" from project_relations
      where source_project_id = $1 and type = 'composition' order by created_at`,
    [portfolioProjectId],
  );
  const memberIds = (members.rows as { projectId: string }[]).map((r) => r.projectId);

  const results: DashboardMember[] = [];
  for (const projectId of memberIds) {
    const [openProposals, rejectedDecisions, runningExperiments] = await Promise.all([
      pool.query(
        `select count(*)::int as n from proposals where project_id = $1 and status in ('draft', 'readyForReview')`,
        [projectId],
      ),
      pool.query(`select count(*)::int as n from decisions where project_id = $1 and decision = 'reject'`, [
        projectId,
      ]),
      pool.query(`select count(*)::int as n from experiments where project_id = $1 and status = 'running'`, [
        projectId,
      ]),
    ]);
    results.push({
      projectId,
      openProposalsCount: (openProposals.rows[0] as { n: number }).n,
      rejectedDecisionsCount: (rejectedDecisions.rows[0] as { n: number }).n,
      runningExperimentsCount: (runningExperiments.rows[0] as { n: number }).n,
    });
  }
  return results;
}

export interface CreateCampaignWaveInput {
  targetProjectIds: string[];
}

export interface CreateCampaignInput {
  finding: string;
  waves: CreateCampaignWaveInput[];
}

export type CreateCampaignOutcome =
  | { kind: "created"; campaignId: string }
  | { kind: "invalid_wave" }
  | { kind: "not_found" };

/** PORT-08/09: toda a criação (campaign + waves + items pending) numa única transação - wave vazia/target inválido não persiste nada. */
export async function createCampaign(
  pool: DbPool,
  scope: AuthScope,
  portfolioProjectId: string,
  input: CreateCampaignInput,
): Promise<CreateCampaignOutcome> {
  if (!input.finding || input.waves.length === 0) return { kind: "invalid_wave" };
  for (const wave of input.waves) {
    if (!wave.targetProjectIds || wave.targetProjectIds.length === 0) return { kind: "invalid_wave" };
  }

  const allTargets = [...new Set(input.waves.flatMap((w) => w.targetProjectIds))];
  for (const targetProjectId of allTargets) {
    const target = await pool.query("select org_id from projects where id = $1", [targetProjectId]);
    const targetRow = target.rows[0] as { org_id: string } | undefined;
    if (!targetRow || targetRow.org_id !== scope.orgId) return { kind: "not_found" };
  }

  return withTx(pool, async (client) => {
    const campaignId = `cam_${randomUUID().replaceAll("-", "")}`;
    await client.query(
      `insert into campaigns (id, org_id, workspace_id, portfolio_project_id, finding) values ($1, $2, $3, $4, $5)`,
      [campaignId, scope.orgId, scope.workspaceId, portfolioProjectId, input.finding],
    );
    for (let i = 0; i < input.waves.length; i++) {
      const waveId = `caw_${randomUUID().replaceAll("-", "")}`;
      const seq = i + 1;
      await client.query(`insert into campaign_waves (id, campaign_id, seq) values ($1, $2, $3)`, [
        waveId,
        campaignId,
        seq,
      ]);
      for (const targetProjectId of input.waves[i]!.targetProjectIds) {
        const itemId = `cai_${randomUUID().replaceAll("-", "")}`;
        await client.query(
          `insert into campaign_items (id, campaign_id, wave_id, target_project_id) values ($1, $2, $3, $4)`,
          [itemId, campaignId, waveId, targetProjectId],
        );
      }
    }
    return { kind: "created", campaignId };
  });
}

export interface CampaignItemRow {
  id: string;
  targetProjectId: string;
  status: string;
  proposalId: string | null;
  exceptionReason: string | null;
}

export interface CampaignWaveRow {
  id: string;
  seq: number;
  name: string | null;
  items: CampaignItemRow[];
}

export interface CampaignDetail {
  id: string;
  finding: string;
  waves: CampaignWaveRow[];
}

export async function getCampaign(
  pool: DbPool,
  portfolioProjectId: string,
  campaignId: string,
): Promise<CampaignDetail | null> {
  const campaignRes = await pool.query(
    `select id, finding from campaigns where id = $1 and portfolio_project_id = $2`,
    [campaignId, portfolioProjectId],
  );
  const campaignRow = campaignRes.rows[0] as { id: string; finding: string } | undefined;
  if (!campaignRow) return null;

  const wavesRes = await pool.query(`select id, seq, name from campaign_waves where campaign_id = $1 order by seq`, [
    campaignId,
  ]);
  const itemsRes = await pool.query(
    `select id, wave_id as "waveId", target_project_id as "targetProjectId", status,
            proposal_id as "proposalId", exception_reason as "exceptionReason"
       from campaign_items where campaign_id = $1 order by created_at`,
    [campaignId],
  );

  const itemsByWave = new Map<string, CampaignItemRow[]>();
  for (const row of itemsRes.rows as Array<CampaignItemRow & { waveId: string }>) {
    const list = itemsByWave.get(row.waveId) ?? [];
    list.push({
      id: row.id,
      targetProjectId: row.targetProjectId,
      status: row.status,
      proposalId: row.proposalId,
      exceptionReason: row.exceptionReason,
    });
    itemsByWave.set(row.waveId, list);
  }
  const waves = (wavesRes.rows as Array<{ id: string; seq: number; name: string | null }>).map((w) => ({
    id: w.id,
    seq: w.seq,
    name: w.name,
    items: itemsByWave.get(w.id) ?? [],
  }));
  return { id: campaignRow.id, finding: campaignRow.finding, waves };
}

interface CampaignItemForTransition {
  id: string;
  status: string;
  targetProjectId: string;
  waveSeq: number;
}

async function loadCampaignItemForUpdate(
  client: { query: DbPool["query"] },
  portfolioProjectId: string,
  campaignId: string,
  itemId: string,
): Promise<CampaignItemForTransition | undefined> {
  const res = await client.query(
    `select ci.id, ci.status, ci.target_project_id as "targetProjectId", cw.seq as "waveSeq"
       from campaign_items ci
       join campaign_waves cw on cw.id = ci.wave_id
       join campaigns c on c.id = ci.campaign_id
      where ci.id = $1 and ci.campaign_id = $2 and c.portfolio_project_id = $3
      for update`,
    [itemId, campaignId, portfolioProjectId],
  );
  return res.rows[0] as CampaignItemForTransition | undefined;
}

/** PORT-11/12/15: gate canary - uma wave só libera quando TODA wave anterior está `completed` ou `exempted`, nunca `pending`. */
async function isPriorWaveResolved(
  client: { query: DbPool["query"] },
  campaignId: string,
  waveSeq: number,
): Promise<boolean> {
  const res = await client.query(
    `select count(*)::int as n from campaign_items ci
       join campaign_waves cw on cw.id = ci.wave_id
      where ci.campaign_id = $1 and cw.seq < $2 and ci.status = 'pending'`,
    [campaignId, waveSeq],
  );
  return (res.rows[0] as { n: number }).n === 0;
}

export interface CompleteItemInput {
  proposalId?: string;
}

export type CompleteItemOutcome =
  | { kind: "completed" }
  | { kind: "not_found" }
  | { kind: "invalid_transition" }
  | { kind: "wave_not_resolved" }
  | { kind: "invalid_proposal_reference" };

/** PORT-10/11/12: `proposalId`, quando informado, precisa pertencer ao MESMO projeto-alvo do item (nunca a outro projeto). */
export async function completeItem(
  pool: DbPool,
  portfolioProjectId: string,
  campaignId: string,
  itemId: string,
  input: CompleteItemInput,
): Promise<CompleteItemOutcome> {
  return withTx(pool, async (client) => {
    const item = await loadCampaignItemForUpdate(client, portfolioProjectId, campaignId, itemId);
    if (!item) return { kind: "not_found" };
    if (item.status !== "pending") return { kind: "invalid_transition" };

    if (input.proposalId) {
      const proposalRes = await client.query("select project_id from proposals where id = $1", [input.proposalId]);
      const proposalRow = proposalRes.rows[0] as { project_id: string } | undefined;
      if (!proposalRow || proposalRow.project_id !== item.targetProjectId) {
        return { kind: "invalid_proposal_reference" };
      }
    }

    const resolved = await isPriorWaveResolved(client, campaignId, item.waveSeq);
    if (!resolved) return { kind: "wave_not_resolved" };

    await client.query(`update campaign_items set status = 'completed', proposal_id = $2, updated_at = now() where id = $1`, [
      itemId,
      input.proposalId ?? null,
    ]);
    return { kind: "completed" };
  });
}

export interface GrantExceptionInput {
  justification: string;
}

export type GrantExceptionOutcome =
  | { kind: "exempted" }
  | { kind: "not_found" }
  | { kind: "invalid_transition" }
  | { kind: "wave_not_resolved" }
  | { kind: "justification_required" };

/** PORT-13/14/15: exceção conta como resolvido para liberar a wave seguinte, igual a `completed`. */
export async function grantException(
  pool: DbPool,
  portfolioProjectId: string,
  campaignId: string,
  itemId: string,
  input: GrantExceptionInput,
): Promise<GrantExceptionOutcome> {
  if (!input.justification || input.justification.trim().length === 0) {
    return { kind: "justification_required" };
  }

  return withTx(pool, async (client) => {
    const item = await loadCampaignItemForUpdate(client, portfolioProjectId, campaignId, itemId);
    if (!item) return { kind: "not_found" };
    if (item.status !== "pending") return { kind: "invalid_transition" };

    const resolved = await isPriorWaveResolved(client, campaignId, item.waveSeq);
    if (!resolved) return { kind: "wave_not_resolved" };

    await client.query(
      `update campaign_items set status = 'exempted', exception_reason = $2, updated_at = now() where id = $1`,
      [itemId, input.justification],
    );
    return { kind: "exempted" };
  });
}

export interface ProgressItem {
  projectId: string;
  wave: number;
  status: string;
}

/**
 * PORT-16/17: exatamente `{projectId, wave, status}` por item, ordenado por
 * wave/declaração - nenhum campo de rank/score é computado ou retornado,
 * de propósito (CORE-FR-053).
 */
export async function getCampaignProgress(
  pool: DbPool,
  portfolioProjectId: string,
  campaignId: string,
): Promise<ProgressItem[] | null> {
  const campaignRes = await pool.query(`select id from campaigns where id = $1 and portfolio_project_id = $2`, [
    campaignId,
    portfolioProjectId,
  ]);
  if (!campaignRes.rows[0]) return null;

  const res = await pool.query(
    `select ci.target_project_id as "projectId", cw.seq as "wave", ci.status
       from campaign_items ci
       join campaign_waves cw on cw.id = ci.wave_id
      where ci.campaign_id = $1
      order by cw.seq, ci.created_at`,
    [campaignId],
  );
  return res.rows as ProgressItem[];
}
