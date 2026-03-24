# Sovereign Attention Firewall

A zero-trust security perimeter for your digital focus.

The **Sovereign Attention Firewall** is an automated enforcement system designed to protect your most valuable asset: your attention. Built for the Notion MCP Challenge, it identifies, quarantines, and silences **Calendar Snipers** (unverified external invites) and **Ghost Projects** (meetings tied to archived work) before they ever interrupt deep work.

[📺 Video Demo](#) | [📝 Dev.to Submission](#)

## 🏛️ System Architecture

The firewall operates as a distributed security circuit between Google Workspace, a custom Cloudflare-hosted MCP, Notion, and Zapier.

![System Architecture](./assets/system_architecture.png)

### 1. The Oracle & Bouncer (Verification)

When a new external invite is received in Google Workspace, the Notion Agent initiates an audit using the **Sovereign Bouncer** (Custom MCP).

- **The Bouncer (Policy Layer):** A Cloudflare Worker that enforces Bearer auth and manages trust logic.
- **The Oracle (Data Authority):** A deterministic registry that returns trust scores and verification status for any given email.
- **Edge Caching:** Resulting verdicts are cached in Cloudflare KV for sub-second performance.

### 2. The Waiting Room (Governance)

Unverified contacts (**Identity Phantoms**) or meetings tied to archived projects (**Ghost Projects**) are moved to a quarantine state.

- **Decision Desk:** Invites are logged into the 📥 Waiting Room DB in Notion for human review.
- **State-Lock:** Once a human decision is made, the Agent locks that state so AI never overrides a manual choice.

### 3. The Enforcement Engine (Execution)

Final actions are executed through a multi-path Zapier webhook bridge.

![Zapier Enforcement Structure](./assets/Zapier-Enforcement-Structure.png)

- **Path A (Block):** Deletes the calendar event and permanently scrubs the source email from Gmail.
- **Path B (Approve):** Formally accepts the RSVP via a `PATCH` request to preserve event metadata.  
  Code: [`zapier-enforcement/mark-event-accepted.ts`](./zapier-enforcement/mark-event-accepted.ts)
- **Path C (Reject):** Formally declines the invite, signaling a professional boundary.  
  Code: [`zapier-enforcement/mark-event-declined.ts`](./zapier-enforcement/mark-event-declined.ts)

## 📂 Repository Structure

```bash
├── /assets                     # Architecture and enforcement diagrams for README
├── /identity-oracle            # Cloudflare Worker: Identity Source of Truth
├── /sovereign-bouncer-mcp      # Cloudflare Worker: Custom MCP Server & KV Caching
├── /notion-governance          # Agent Instructions (The Constitution) & DB Schemas
└── /zapier-enforcement         # Webhook logic for Silent Deletion and RSVPs
```

## 🛠️ Setup & Installation

### 1. Cloudflare Workers

Deploy in this order:

```bash
cd identity-oracle
wrangler deploy
```

Copy the Oracle URL from deploy output (for example: `https://identity-oracle.<your-subdomain>.workers.dev`).  
You will use this value as `IDENTITY_ORACLE_URL` in bouncer secrets.

Then prepare the bouncer:

```bash
cd sovereign-bouncer-mcp
wrangler kv namespace create SOVEREIGN_KV
```

Copy the returned namespace `id` and replace `REPLACE_WITH_YOUR_SOVEREIGN_KV_ID` in `wrangler.jsonc`.

Set runtime values as Wrangler secrets before deploying the bouncer:

```bash
cd sovereign-bouncer-mcp
wrangler secret put SOVEREIGN_SECRET
wrangler secret put IDENTITY_ORACLE_URL
wrangler deploy
```

`SOVEREIGN_SECRET` is your private shared token for the Sovereign Bouncer.  
It is used as the **Bearer token** in **Notion Custom MCP authentication** (the token you paste into Notion when connecting the MCP server).

### 2. Notion Agent

Connect the Notion MCP to your workspace and configure Calendar Shield as the orchestration layer.

- Create a **Calendar Shield** hub page and embed live views for governance databases.
- Import and configure:
  - **🛡️ Sovereign Policy DB** (policy definitions, active state, metrics)
  - **📥 Waiting Room DB** (review queue + audit trail + human-in-the-loop decisioning)
  - **🚫 Block List DB** (persistent deny list by sender/domain)
  - **📂 Projects DB** (used for Ghost Project detection)
- Add `instructions.md` (The Constitution) to the Agent system prompt.
- Configure integrations:
  - **Google Calendar (Notion Calendar):** read + write for next-24h scanning and enforcement actions
  - **Gmail (Notion Mail):** draft-only verification messages when context is missing
- For the Custom MCP connection:
  - MCP URL: your deployed `sovereign-bouncer-mcp` endpoint (typically `/mcp`)
  - Auth type: **Bearer token**
  - Token value: the exact `SOVEREIGN_SECRET` you set with `wrangler secret put SOVEREIGN_SECRET`
- Configure triggers:
  - **Daily recurrence:** 7:00 AM Africa/Lagos (enabled)
  - **Agent mentioned:** on-demand/manual mode (optional)

### 3. Zapier Bridge

Create a Zap that receives Notion decisions and executes final enforcement.

- Trigger:
  - **Webhooks by Zapier — Catch Hook** from Notion payload (`calendarId`, `eventId`, `decision`, etc.)
- Router:
  - **Paths by Zapier** split by decision
- Path A: **Blocked / Rejected**
  - Google Calendar: Delete Event
  - Gmail: Find Email -> Delete Email
- Path B: **Approved**
  - Google Calendar: Mark Event as Accepted
  - Code: [`zapier-enforcement/mark-event-accepted.ts`](./zapier-enforcement/mark-event-accepted.ts)
- Path C: **Cancelled**
  - Google Calendar: Update RSVP to non-attending / declined
  - Code: [`zapier-enforcement/mark-event-declined.ts`](./zapier-enforcement/mark-event-declined.ts)

One-line operating model: **Notion decides, Zapier enforces.**

## ⚖️ The Sovereign Principles (Absolute Rules)

- **Silence is Security:** The system never “declines” a phantom. It deletes silently (`sendUpdates=false`) so spammers never get a signal that your address is active.
- **2-Strike Escalation:** If a sender is manually rejected twice in Notion, they are automatically promoted to the 🚫 Block List DB for future hard denials.
- **Contextual Integrity:** If a project is marked “Archived” in Notion, all related future meetings are automatically treated as Ghost Projects.

## 🏆 Notion MCP Challenge

This project demonstrates Notion as an orchestration layer for complex, distributed AI systems. By bridging edge compute (Cloudflare) and workplace automation (Zapier), it creates a system that doesn't just organize work; it defends it.
