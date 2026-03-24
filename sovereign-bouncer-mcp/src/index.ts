export interface Env {
  SOVEREIGN_KV: KVNamespace;
  SOVEREIGN_SECRET: string;
  IDENTITY_ORACLE_URL: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" };
const TRUSTED_TTL_SECONDS = 60 * 60 * 24 * 7;
const UNVERIFIED_TTL_SECONDS = 60 * 60 * 24;
const MCP_PROTOCOL_VERSION = "2025-06-18";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface TrustResult {
  email: string;
  score: number;
  status: "Verified" | "Unverified" | string;
  name: string;
  trustTier: 2 | 0;
  verdict: "TRUSTED" | "UNVERIFIED";
  shouldQuarantine: boolean;
}

interface OracleResponse {
  name: string;
  score: number;
  status: "Verified" | "Unverified" | string;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: JSON_HEADERS,
  });
}

function isLikelyEmail(value: string): boolean {
  // Enforce a conservative email shape to avoid malformed Gmail query fragments.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requireSovereignAuth(request: Request, env: Env): boolean {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 && token === env.SOVEREIGN_SECRET;
}

function jsonRpcResponse(id: JsonRpcId, result: unknown): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      result,
    }),
    {
      headers: {
        ...JSON_HEADERS,
        "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
      },
    }
  );
}

function jsonRpcError(id: JsonRpcId, error: JsonRpcError, status = 200): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error,
    }),
    {
      status,
      headers: {
        ...JSON_HEADERS,
        "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
      },
    }
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function getEmailFromBody(body: unknown): string | null {
  const record = asRecord(body);
  if (!record || typeof record.email !== "string") {
    return null;
  }
  const normalizedEmail = record.email.toLowerCase().trim();
  if (!isLikelyEmail(normalizedEmail)) {
    return null;
  }
  return normalizedEmail;
}

async function verifyEmailTrust(normalizedEmail: string, env: Env): Promise<TrustResult | Response> {
  const cacheKey = `trust:${normalizedEmail}`;
  let oracleUrl: string;
  try {
    const parsed = new URL(env.IDENTITY_ORACLE_URL.trim());
    // Normalize to oracle root so stale path suffixes like /mcp cannot break calls.
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    oracleUrl = parsed.toString();
  } catch (error) {
    console.error("verify_email_trust:oracle_url_invalid", {
      rawOracleUrl: env.IDENTITY_ORACLE_URL,
      error,
    });
    return jsonResponse(
      {
        error: "Configuration Error",
        message: "IDENTITY_ORACLE_URL is invalid",
      },
      { status: 500 }
    );
  }
  console.log("verify_email_trust:start", {
    email: normalizedEmail,
    cacheKey,
    rawOracleUrl: env.IDENTITY_ORACLE_URL,
    oracleUrl,
  });

  const cached = await env.SOVEREIGN_KV.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as TrustResult;
      console.log("verify_email_trust:cache_hit", { email: normalizedEmail, score: parsed.score, verdict: parsed.verdict });
      return parsed;
    } catch (error) {
      console.error("verify_email_trust:cache_parse_error", { email: normalizedEmail, error });
      // Fall through to refresh from Oracle when cache value is corrupt.
    }
  }

  let oracleData: OracleResponse;
  try {
    console.log("verify_email_trust:oracle_request", { email: normalizedEmail });
    const res = await fetch(oracleUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: normalizedEmail }),
    });
    if (!res.ok) {
      const status = res.status >= 400 && res.status < 500 ? 502 : 503;
      const upstreamBody = await res.text();
      console.error("verify_email_trust:oracle_http_error", {
        email: normalizedEmail,
        oracleUrl,
        upstreamStatus: res.status,
        mappedStatus: status,
        upstreamBody,
      });
      return jsonResponse(
        {
          error: "Upstream Oracle Error",
          message: "Identity Oracle request failed",
          upstreamStatus: res.status,
        },
        { status }
      );
    }
    const data = (await res.json()) as Partial<OracleResponse>;
    if (
      typeof data.score !== "number" ||
      typeof data.status !== "string" ||
      typeof data.name !== "string"
    ) {
      console.error("verify_email_trust:oracle_invalid_payload", {
        email: normalizedEmail,
        payload: data,
      });
      return jsonResponse(
        {
          error: "Upstream Oracle Error",
          message: "Identity Oracle returned invalid payload",
        },
        { status: 502 }
      );
    }
    oracleData = data as OracleResponse;
    console.log("verify_email_trust:oracle_ok", {
      email: normalizedEmail,
      score: oracleData.score,
      status: oracleData.status,
    });
  } catch (error) {
    console.error("verify_email_trust:oracle_exception", { email: normalizedEmail, error });
    return jsonResponse({ error: "Upstream Oracle Error", message: "Unable to reach Identity Oracle" }, { status: 503 });
  }

  const isTrusted = oracleData.score > 50;
  const result: TrustResult = {
    email: normalizedEmail,
    score: oracleData.score,
    status: oracleData.status,
    name: oracleData.name,
    trustTier: isTrusted ? 2 : 0,
    verdict: isTrusted ? "TRUSTED" : "UNVERIFIED",
    shouldQuarantine: oracleData.score === 0
  };

  await env.SOVEREIGN_KV.put(cacheKey, JSON.stringify(result), {
    expirationTtl: isTrusted ? TRUSTED_TTL_SECONDS : UNVERIFIED_TTL_SECONDS
  });
  console.log("verify_email_trust:result_cached", {
    email: normalizedEmail,
    score: result.score,
    verdict: result.verdict,
    shouldQuarantine: result.shouldQuarantine,
  });

  return result;
}

async function handleLegacyRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed", message: "POST only" }, { status: 405 });
  }

  if (!requireSovereignAuth(request, env)) {
    return jsonResponse({ error: "Unauthorized", message: "Invalid sovereign secret" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Bad Request", message: "Invalid JSON body" }, { status: 400 });
  }

  const normalizedEmail = getEmailFromBody(body);
  if (!normalizedEmail) {
    return jsonResponse({ error: "Bad Request", message: "Invalid or missing `email`" }, { status: 400 });
  }

  const result = await verifyEmailTrust(normalizedEmail, env);
  if (result instanceof Response) {
    return result;
  }

  return jsonResponse(result);
}

async function handleMcpRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonRpcError(null, { code: -32600, message: "MCP endpoint expects POST" }, 405);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonRpcError(null, { code: -32700, message: "Parse error" });
  }

  if (Array.isArray(payload) || !asRecord(payload)) {
    return jsonRpcError(null, { code: -32600, message: "Invalid Request" });
  }

  const rpc = payload as JsonRpcRequest;
  const id = rpc.id ?? null;
  if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
    return jsonRpcError(id, { code: -32600, message: "Invalid Request" });
  }

  if (rpc.method === "initialize") {
    return jsonRpcResponse(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: "sovereign-gatekeeper-bouncer",
        version: "1.0.0"
      }
    });
  }

  if (rpc.method === "tools/list") {
    return jsonRpcResponse(id, {
      tools: [
        {
          name: "verify_email_trust",
          description: "Checks if the authenticated Gmail account has previously sent mail to the target email.",
          inputSchema: {
            type: "object",
            properties: {
              email: {
                type: "string",
                description: "Email address to verify"
              }
            },
            required: ["email"],
            additionalProperties: false
          }
        }
      ]
    });
  }

  if (rpc.method === "tools/call") {
    console.log("mcp:tools_call:received", { id });
    const params = asRecord(rpc.params);
    if (!params || params.name !== "verify_email_trust") {
      console.error("mcp:tools_call:invalid_tool", { id, params });
      return jsonRpcError(id, { code: -32602, message: "Invalid params: unsupported tool name" });
    }

    if (!requireSovereignAuth(request, env)) {
      console.error("mcp:tools_call:unauthorized", { id });
      return jsonRpcError(id, { code: -32001, message: "Unauthorized: invalid sovereign secret" }, 401);
    }

    const args = asRecord(params.arguments);
    const email = args && typeof args.email === "string" ? args.email.toLowerCase().trim() : null;
    if (!email || !isLikelyEmail(email)) {
      console.error("mcp:tools_call:invalid_email", { id, args });
      return jsonRpcError(id, { code: -32602, message: "Invalid params: expected valid `arguments.email`" });
    }

    const result = await verifyEmailTrust(email, env);
    if (result instanceof Response) {
      let upstream: unknown = undefined;
      try {
        upstream = await result.clone().json();
      } catch {
        upstream = await result.clone().text();
      }
      console.error("mcp:tools_call:verify_failed", {
        id,
        status: result.status,
        upstream,
      });
      return jsonRpcError(id, { code: -32000, message: "Tool execution failed" }, result.status);
    }
    console.log("mcp:tools_call:success", { id, email, score: result.score, verdict: result.verdict });

    const output = {
      ...result,
      metadata: {
        oracleStatus: result.status,
        oracleScore: result.score,
      },
    };

    return jsonRpcResponse(id, {
      content: [
        {
          type: "text",
          text: JSON.stringify(output)
        }
      ]
    });
  }

  return jsonRpcError(id, { code: -32601, message: "Method not found" });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") {
      return handleMcpRequest(request, env);
    }

    return handleLegacyRequest(request, env);
  }
};
