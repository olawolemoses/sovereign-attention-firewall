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

Copy the Oracle URL from deploy output, then prepare the bouncer:

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

### 2. Notion Agent

- Connect the Notion MCP to your workspace.
- Import the Sovereign Policy DB and Waiting Room DB.
- Add `instructions.md` (The Constitution) to your Agent's system prompt.

### 3. Zapier Bridge

- Create a new Zap with a **Webhooks by Zapier** trigger.
- Map the three paths (Approve, Reject, Block) to corresponding Google Calendar and Gmail actions as documented in `/zapier-enforcement`.

## ⚖️ The Sovereign Principles (Absolute Rules)

- **Silence is Security:** The system never “declines” a phantom. It deletes silently (`sendUpdates=false`) so spammers never get a signal that your address is active.
- **2-Strike Escalation:** If a sender is manually rejected twice in Notion, they are automatically promoted to the 🚫 Block List DB for future hard denials.
- **Contextual Integrity:** If a project is marked “Archived” in Notion, all related future meetings are automatically treated as Ghost Projects.

## 🔐 Environment Strategy (GitHub Safe)

- Do not commit real environment values in `wrangler.jsonc`.
- Store sensitive and deployment-specific values as Cloudflare secrets:
  - `SOVEREIGN_SECRET`
  - `IDENTITY_ORACLE_URL`
- Do not commit real Cloudflare resource IDs (for example KV namespace IDs). Keep placeholders in Git and set real IDs per environment.
- Keep local-only files (`.env*`, `.dev.vars*`, `.wrangler/`) out of Git via `.gitignore`.
- If you need to share required keys with collaborators, document key names only, not key values.

## 🏆 Notion MCP Challenge

This project demonstrates Notion as an orchestration layer for complex, distributed AI systems. By bridging edge compute (Cloudflare) and workplace automation (Zapier), it creates a system that doesn't just organize work; it defends it.

## 🧠 From The Notion Point Of View

### Calendar Shield (Agent) — Submission Description

#### What it is

**Calendar Shield** is a defensive automation agent that protects your calendar from:

- **Identity Phantoms**: events created by **untrusted organizers** (unknown or suspicious senders).
- **Ghost Projects**: meetings tied to **archived or completed projects**, so they no longer deserve time on the calendar.

It runs on a schedule, scans upcoming meetings, takes silent protective actions, and logs everything for review and auditability.

### 1) Setup (what you create in Notion)

#### Core hub page

- **Calendar Shield** page: the control center where databases are embedded as live views.

#### Databases (and what each one does)

- **🛡️ Sovereign Policy DB**: stores security policies, active state, cadence, trigger counts, and last-trigger timestamps.
- **📥 Waiting Room DB**: human review queue and audit log per event (sender, event metadata, reasoning, decision state).
- **🚫 Block List DB**: permanent deny list by sender email or domain, including reason and filter counts.
- **📂 Projects DB**: project registry for ghost detection; archived/completed matches trigger quarantine.
- **📅 Proposed Meetings DB**: holding area for decisioning (Pending, Accepted, Declined) in a human-in-the-loop flow.

#### Daily logs

- **Daily Briefs** page: daily pages like `🛡️ Sovereign Security Log - YYYY-MM-DD` with executive summary and action-required sections.

### 2) Connections (integrations) and their purposes

#### Calendar integration (Google Calendar via Notion Calendar)

Purpose:

- Fetch events for the next 24 hours.
- Take protective actions on events.
- Operate on primary calendar with write access and skip-confirmation for automation.

#### Mail integration (Gmail via Notion Mail)

Purpose:

- Draft verification emails for context-missing events (e.g., empty descriptions).
- Draft from `olawoleogunleye@learnd.co`.
- Sending configured **with confirmation** to prevent accidental outbound mail.

#### Custom MCP tool: SovereignBouncer

Purpose:

- Run organizer trust checks via `verify_email_trust(email=organizerEmail)`.
- Return:
  - `shouldQuarantine` (boolean)
  - `verdict` (string explanation)
- Quarantine and log event if `shouldQuarantine = true`.

### 3) Triggers (how it runs automatically)

- **Daily recurrence trigger (enabled):** every day at **7:00 AM Africa/Lagos**.
- **Agent mentioned trigger (disabled):** optional manual/on-demand mode.

### 4) The Flow (end-to-end logic)

#### Phase 0 — Auto-bootstrap policies

If **Sovereign Policy DB** is empty, create defaults:

- **P1: Identity Proof** (quarantine if bouncer says untrusted)
- **P2: Ghost Hunter** (quarantine if project is archived/completed)
- **P3: Context Tax** (request verification if description is empty)

#### Step 1 — Scan events (next 24 hours)

- Fetch upcoming 24-hour events.
- Audit only events where organizer is not the owner.

#### Step 1.25 — Waiting Room cleanup and enforcement (state lock)

- Skip events with non-pending decisions.
- Refresh timestamps instead of duplicating pending records.
- Mark pending entries as **Cancelled** if event no longer exists.

#### Step 1.3 — 2-strike escalation (auto-block)

- Auto-add organizer to **Block List DB** after **2+ historical Rejected** decisions.

#### Step 1.5 — Block list hard deny

- Match organizer email/domain against **Block List DB**.
- Silently remove event (no notifications).
- Log as **Blocked** in Waiting Room.
- Increment block list filter counters.

#### Step 2 — Identity audit (SovereignBouncer)

- Call `verify_email_trust`.
- If quarantined, classify as **Identity Phantom**.
- Silently quarantine and log with bouncer verdict.

#### Step 3 — Ghost project detection (Projects DB)

- Extract meeting-title keywords.
- Match against project names/keywords.
- If matched project is archived/completed, classify as **Ghost Project** and quarantine.

#### Step 4 — Close the loop + Daily Brief

- Draft verification emails for context-missing meetings (manual send).
- Update policy metrics.
- Write daily brief with summary, blocked counts, health, and action links.

### Zapier enforcement (webhook) — submission-ready description

Zapier is the execution layer that applies decisions emitted by Calendar Shield.

#### Trigger and router

1. **Webhooks by Zapier — Catch webhook from Notion**
- Receives event payload from Calendar Shield (Event ID, Calendar ID, Decision, etc.).
2. **Paths — Split into paths**
- Routes workflow by decision outcome.

#### Path A — Blocked / Rejected (hard enforcement)

Condition: `Decision = Blocked` or `Decision = Rejected`

Actions:

- Google Calendar: Delete Event
- Gmail: Find Email
- Gmail: Delete Email

Purpose: Full quarantine from both calendar and inbox.

#### Path B — Approved (allow + normalize)

Condition: `Decision = Approved`

Actions:

- Google Calendar: Mark Event as Accepted

Purpose: Explicitly confirm legitimate meetings.

#### Path C — Cancelled (close-out hygiene)

Condition: `Decision = Cancelled`

Actions:

- Google Calendar: Update RSVP status to non-attending

Purpose: Keep calendar state consistent and resolved.

#### One-line summary

**Notion decides, Zapier enforces.**
