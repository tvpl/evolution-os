import { redirect } from "next/navigation";
import { hubGet, sessionToken } from "../../../lib/hub";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

interface ProjectRow {
  project_id: string;
  name: string;
  type: string;
  registered_at: string;
}

export default async function ProjectsPage() {
  const token = await sessionToken();
  if (!token) redirect("/login");

  const res = await hubGet("/projects", token);
  if (res.status === 401) redirect("/login");
  const data = (await res.json()) as { projects?: ProjectRow[] };
  const projects = data.projects ?? [];

  return (
    <main>
      <h2>Projetos</h2>
      <RegisterForm />
      {projects.length === 0 ? (
        <p>Nenhum projeto registrado ainda.</p>
      ) : (
        <ul data-testid="project-list">
          {projects.map((p) => (
            <li key={p.project_id}>
              <strong>{p.name}</strong> — {p.type}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
