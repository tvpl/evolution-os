import { createHmac, timingSafeEqual } from "node:crypto";

/** Escopo derivado da sessão — a ÚNICA fonte de tenant/workspace (ADR-014). */
export interface AuthScope {
  userId: string;
  orgId: string;
  workspaceId: string;
}

const DEV_SECRET = "evolution-os-dev-secret-not-for-production";

export function sessionSecret(): string {
  return process.env["EVOOS_SESSION_SECRET"] ?? DEV_SECRET;
}

function hmac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signSession(scope: AuthScope, secret: string = sessionSecret()): string {
  const payload = Buffer.from(JSON.stringify(scope), "utf8").toString("base64url");
  return `${payload}.${hmac(payload, secret)}`;
}

export function verifySession(token: string, secret: string = sessionSecret()): AuthScope | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = hmac(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const scope = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AuthScope;
    if (!scope.userId || !scope.orgId || !scope.workspaceId) return null;
    return { userId: scope.userId, orgId: scope.orgId, workspaceId: scope.workspaceId };
  } catch {
    return null;
  }
}
