import { notFound, redirect } from "next/navigation";
import { hubGet, sessionToken } from "../../../../lib/hub";

export const dynamic = "force-dynamic";

interface Hypothesis {
  id: string;
  statement: string;
  type: string | null;
  evidenceState: string | null;
  status: string;
  authority: string;
}

interface ConstraintRow {
  id: string;
  category: string | null;
  statement: string;
  severity: string;
  authority: string;
}

interface Overview {
  projectId: string;
  name: string;
  type: string;
  status: string;
  intent: { problem?: string } | null;
  hypotheses: Hypothesis[];
  constraints: ConstraintRow[];
  artifactCount: number;
  decisionCount: number;
}

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const token = await sessionToken();
  if (!token) redirect("/login");

  const res = await hubGet(`/projects/${projectId}/overview`, token);
  if (res.status === 401) redirect("/login");
  if (res.status === 404) notFound();
  if (!res.ok) {
    throw new Error(`overview request failed: ${res.status}`);
  }
  const overview = (await res.json()) as Overview;

  return (
    <main>
      <h2 data-testid="overview-name">{overview.name}</h2>
      <p>
        {overview.type} — {overview.status}
      </p>
      {overview.intent?.problem ? <p>{overview.intent.problem}</p> : null}

      <h3>Hipóteses</h3>
      {overview.hypotheses.length === 0 ? (
        <p>Nenhuma hipótese registrada.</p>
      ) : (
        <ul data-testid="hypothesis-list">
          {overview.hypotheses.map((h) => (
            <li key={h.id}>
              {h.statement} — {h.status} ({h.authority})
            </li>
          ))}
        </ul>
      )}

      <h3>Constraints</h3>
      {overview.constraints.length === 0 ? (
        <p>Nenhuma constraint registrada.</p>
      ) : (
        <ul data-testid="constraint-list">
          {overview.constraints.map((c) => (
            <li key={c.id}>
              {c.statement} — {c.severity}
            </li>
          ))}
        </ul>
      )}

      <p data-testid="overview-counts">
        {overview.artifactCount} artefato(s), {overview.decisionCount} decisão(ões)
      </p>
    </main>
  );
}
