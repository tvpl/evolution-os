import { cookies } from "next/headers";

/** URL do Control Plane; o console NUNCA acessa banco nem decide policy (ADR-003). */
export function hubUrl(): string {
  return process.env["HUB_URL"] ?? "http://127.0.0.1:4010";
}

export const SESSION_COOKIE = "evoos_session";

export async function sessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function hubGet(path: string, token: string): Promise<Response> {
  return fetch(`${hubUrl()}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}
