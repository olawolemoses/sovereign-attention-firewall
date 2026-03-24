interface RegistryEntry {
  name: string;
  score: number;
  status: "Verified";
}

interface MockRegistry {
  emails: Record<string, RegistryEntry>;
  whitelisted_domains: Record<string, RegistryEntry>;
}

/**
 * MOCK IDENTITY REGISTRY
 * This is a deterministic demo stub for the challenge, not a production identity backend.
 * Swap this data source with your real trust engine/API in production.
 */
const MOCK_REGISTRY: MockRegistry = {
  emails: {
    "alex@trustedco.com": {
      name: "Alex Morgan",
      score: 92,
      status: "Verified",
    },
    "sara@partnerops.io": {
      name: "Sara Kim",
      score: 81,
      status: "Verified",
    },
    "michael@enterprise.org": {
      name: "Michael Chen",
      score: 88,
      status: "Verified",
    },
    "ops@vendorhub.net": {
      name: "Vendor Ops",
      score: 76,
      status: "Verified",
    },
    "nina@collabteam.co": {
      name: "Nina Patel",
      score: 69,
      status: "Verified",
    },
    "jordan@designsync.studio": {
      name: "Jordan Lee",
      score: 84,
      status: "Verified",
    },
  },
  whitelisted_domains: {
    "trustedco.com": {
      name: "TrustedCo Domain Allowlist",
      score: 75,
      status: "Verified",
    },
    "partnerops.io": {
      name: "PartnerOps Domain Allowlist",
      score: 72,
      status: "Verified",
    },
    "enterprise.org": {
      name: "Enterprise Domain Allowlist",
      score: 70,
      status: "Verified",
    },
  },
};

function normalizeEmail(value: string): string {
  return value.toLowerCase().trim();
}

function mockLookupIdentity(email: string): { name: string; score: number; status: "Verified" | "Unverified" } {
  // Priority 1: explicit per-email trust record.
  const emailRecord = MOCK_REGISTRY.emails[email];
  if (emailRecord) return emailRecord;

  // Priority 2: domain-level allowlist fallback.
  const atIndex = email.lastIndexOf("@");
  const domain = atIndex >= 0 ? email.slice(atIndex + 1) : "";
  const domainRecord = domain ? MOCK_REGISTRY.whitelisted_domains[domain] : undefined;
  if (domainRecord) return domainRecord;

  // Fallback response for unknown senders in this mock service.
  return {
    name: "Unknown",
    score: 0,
    status: "Unverified",
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    // This worker intentionally exposes one simple mock endpoint for deterministic trust checks.
    if (request.method !== "POST") {
      return Response.json({ error: "Method Not Allowed", message: "POST only" }, { status: 405 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Bad Request", message: "Invalid JSON body" }, { status: 400 });
    }

    const emailRaw =
      typeof body === "object" && body !== null && typeof (body as { email?: unknown }).email === "string"
        ? (body as { email: string }).email
        : null;

    if (!emailRaw) {
      return Response.json({ error: "Bad Request", message: "Missing email" }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);
    const identity = mockLookupIdentity(email);
    return Response.json(identity);
  },
};
