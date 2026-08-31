"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("dev-a@evolutionos.local");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(String(body.detail ?? "login falhou"));
      return;
    }
    const { workspaceId } = await res.json();
    router.push(`/w/${workspaceId}/projects`);
  }

  return (
    <main>
      <h2>Entrar (dev identity)</h2>
      <form onSubmit={onSubmit}>
        <label>
          E-mail{" "}
          <input
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ minWidth: 280 }}
          />
        </label>{" "}
        <button type="submit">Entrar</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
