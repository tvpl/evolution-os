import { NextResponse } from "next/server";
import { hubUrl, sessionToken } from "../../lib/hub";

/**
 * BFF do comando register-project: repassa Idempotency-Key e traceparent ao
 * Hub. Nenhuma lógica authoritative aqui (ADR-003).
 */
export async function POST(req: Request): Promise<NextResponse> {
  const token = await sessionToken();
  if (!token) {
    return NextResponse.json({ title: "unauthenticated", status: 401 }, { status: 401 });
  }
  const idempotencyKey = req.headers.get("idempotency-key") ?? crypto.randomUUID();
  const traceparent = req.headers.get("traceparent");
  const res = await fetch(`${hubUrl()}/projects`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": idempotencyKey,
      ...(traceparent ? { traceparent } : {}),
    },
    body: JSON.stringify(await req.json().catch(() => ({}))),
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
