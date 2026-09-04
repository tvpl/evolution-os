import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hubUrl, SESSION_COOKIE } from "../../lib/hub";

/** BFF de sessão: token do Hub vai para cookie HttpOnly — nunca ao JS do browser. */
export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const res = await fetch(`${hubUrl()}/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: body.email }),
  });
  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }
  const response = NextResponse.json({ workspaceId: data.scope.workspaceId });
  const store = await cookies();
  store.set(SESSION_COOKIE, data.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
