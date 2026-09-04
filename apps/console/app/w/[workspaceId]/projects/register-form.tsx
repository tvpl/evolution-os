"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

/**
 * Form do walking skeleton. A Idempotency-Key é gerada por tentativa de
 * registro e REUTILIZADA em retries do mesmo envio (idempotência real).
 * Após o registro, a lista (projeção) é atualizada por refresh — a projeção é
 * assíncrona via outbox, então tentamos algumas vezes.
 */
export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    idempotencyKey.current ??= crypto.randomUUID();
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
      body: JSON.stringify({
        apiVersion: "evolutionos.io/v1alpha1",
        kind: "EvolutionProject",
        metadata: { name, slug, type: "product", status: "discovery" },
        spec: { intent: { problem: "definir" } },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const details = Array.isArray(body.errors) ? `: ${body.errors.join("; ")}` : "";
      setError(`${String(body.title ?? "erro")}${details}`);
      return;
    }
    idempotencyKey.current = null;
    setStatus(`registrado: ${String(body.projectId)}`);
    setName("");
    setSlug("");
    for (let i = 0; i < 6; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginBottom: "1rem" }}>
      <label>
        Nome{" "}
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>{" "}
      <label>
        Slug{" "}
        <input name="slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
      </label>{" "}
      <button type="submit">Registrar projeto</button>
      {status ? <p data-testid="register-status">{status}</p> : null}
      {error ? (
        <p role="alert" data-testid="register-error">
          {error}
        </p>
      ) : null}
    </form>
  );
}
