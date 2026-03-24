interface RegistryEntry {
  name: string;
  score: number;
  status: "Verified";
}

const REGISTRY: Record<string, RegistryEntry> = {
  "olawole@example.com": {
    name: "Olawole Moses Ogunleye",
    score: 92,
    status: "Verified",
  },
  "partner@example.com": {
    name: "Trusted Partner",
    score: 81,
    status: "Verified",
  },
};

export default {
  async fetch(request: Request): Promise<Response> {
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

    const email = emailRaw.toLowerCase().trim();
    const found = REGISTRY[email];

    if (found) {
      return Response.json(found);
    }

    return Response.json({
      name: "Unknown",
      score: 0,
      status: "Unverified",
    });
  },
};
