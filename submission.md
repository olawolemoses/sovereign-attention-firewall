*This is a submission for the [Notion MCP Challenge](https://dev.to/challenges/notion-2026-03-04)*

## What I Built

**The Sovereign Attention Firewall** — a zero-trust AI perimeter that defends your calendar and inbox from **Calendar Snipers** (unverified external invites) and **Ghost Projects** (meetings tied to archived work), before they ever interrupt deep work.

**Why this exists:** Procurement professionals, operations leads, and anyone with a visible business title knows the pain. ZoomInfo scraped your LinkedIn. Now your calendar is bleeding ghost meetings, your inbox drowns in "just circling back" sequences, and every cold SDR thinks they own 30 minutes of your Tuesday. The Reddit procurement community has a name for it: attention theft. The only current defenses are manual — reply templates, block lists, and sheer emotional labour.

The real cost isn't the emails. It's the cognitive fragmentation. Every unvetted vendor ping is a context switch tax on your focused work.

**What it does:** The Sovereign Attention Firewall creates a human-in-the-loop AI enforcement system that:

- Intercepts every external calendar invite and runs it through a zero-trust identity check
- Detects **Identity Phantoms** (invites from unverified or suspicious organizers) and **Ghost Projects** (meetings tied to archived/completed work)
- Quarantines flagged invites into a Notion **Waiting Room** for human review — nothing is blocked without your approval
- Executes silent enforcement: rejected invites are deleted with `sendUpdates: false`, giving no signal back to the sender that your address is active
- Escalates repeat offenders automatically to a permanent **Block List** after two rejections
- Maintains a daily **Sovereign Security Log** in Notion — a full audit trail of what was caught, why, and what action was taken

The default flips: your calendar becomes as defensible as your infrastructure.

---

## Video Demo

[![Watch the demo on YouTube](https://img.youtube.com/vi/SaMDaOk9Etc/maxresdefault.jpg)](https://youtu.be/SaMDaOk9Etc)

Direct link: https://youtu.be/SaMDaOk9Etc

---

## Show Us the Code

🔗 [github.com/olawolemoses/sovereign-attention-firewall](https://github.com/olawolemoses/sovereign-attention-firewall)

The system is built with:

- **Custom Notion Agent** — the orchestration core, governed by an Agent Constitution (system prompt) that constrains it to act as a deterministic Security Controller
- **Cloudflare Workers (TypeScript)** for:
  - `identity-oracle` — deterministic identity registry; checks email allowlists, falls back to domain whitelists, returns `Unverified` for unknowns. Verdicts are cached in Cloudflare KV for sub-second performance.
  - `sovereign-bouncer-mcp` — custom MCP server enforcing Bearer auth and trust logic, deployed at the edge
- **Notion databases** as the state management and governance layer
- **Zapier (Webhook + Paths)** as the enforcement bridge across Google Calendar and Gmail
- **Google Calendar + Gmail** for event handling, silent enforcement, and RSVP management

---

## How I Used Notion MCP

Notion MCP is not a peripheral integration here. It is the **orchestration core** of the Sovereign Attention Firewall, powered by a **Custom Notion Agent**.

By defining a specific **Agent Constitution**, I've constrained the AI to act as a deterministic Security Controller. This Custom Notion Agent is equipped with the **Sovereign Bouncer (MCP Tool)**, allowing it to reach out to the Cloudflare Edge to verify identities before updating the workspace. This ensures the AI isn't just "guessing" — it's executing a verified security policy against real-time forensic data.

---

### 🧠 The Custom Notion Agent as Orchestration Core

The Custom Notion Agent is the central brain of the system. It runs on a schedule and executes a multi-phase security protocol:

- **Phase 0 (Auto-bootstrap):** Queries the 🛡️ Sovereign Policy DB and self-initializes the three core policies if they don't exist — making the system idempotent across cold starts
- **Step 1 (Horizon scan):** Fetches all calendar events for the next 24 hours, filtering to external organizers only
- **Step 1.25 (Waiting Room cleanup):** Enforces a one-way valve — events with a terminal Decision (`Approved`, `Rejected`, `Blocked`, `Cancelled`) are never re-audited. This is the State Lock.
- **Step 1.3 (Block List upsert):** Syncs manual `Blocked` decisions from Waiting Room into Block List DB automatically
- **Step 1.5 (Block List pre-check):** Hard-denies any organizer already on the block list before any other logic runs
- **Step 2 (Identity audit):** Calls `verify_email_trust` on the Sovereign Bouncer MCP tool. If `shouldQuarantine = true` or the tool errors, the event is logged as an Identity Phantom
- **Step 3 (Ghost Project detection):** Matches invite title against Projects DB. Archived or Completed project matches are flagged automatically
- **Step 4 (Closing the loop):** Updates policy trigger counts, generates the daily Sovereign Security Log

The Agent never declines or deletes events automatically. Every enforcement action flows through a human decision in Notion first.

<details>
<summary><strong>📜 Agent Constitution (Full System Prompt)</strong></summary>

```
MISSION: SOVEREIGN ATTENTION FIREWALL

Calendar Shield protects the calendar schedule from Identity Phantoms
(untrusted organizers) and Ghost Projects (meetings tied to archived
or completed projects).

OPERATING WINDOW
- Scan events occurring in the next 24 hours from the current run time.
- Only audit events where organizer email != <PROTECTED_CALENDAR_EMAIL>.

IDENTITY ANCHOR
- Protected calendar identity email: <PROTECTED_CALENDAR_EMAIL>.

PHASE 0: AUTO-BOOTSTRAP (THE CONSTITUTION)
Before each run, query Sovereign Policy DB.
- If empty, create exactly these policies (Active = checked):
  - P1: Identity Proof — Rule: shouldQuarantine is true — Action: Flag for Review
  - P2: Ghost Hunter — Rule: Project Status is Archived/Completed — Action: Flag for Review
  - P3: Context Tax — Rule: Empty Description — Action: Request Verification

STEP 1: SCAN THE HORIZON
- Fetch all calendar events for the next 24 hours using the Calendar integration.

STEP 1.25: WAITING ROOM CLEANUP & ENFORCEMENT (HUMAN-IN-THE-LOOP)
Before auditing any event, search Waiting Room DB.
- Respect prior decisions (State Lock / One-way valve):
  - If an event with the same Event ID already exists and Decision is NOT Pending
    (Approved, Rejected, Blocked, Cancelled), do not audit again.
- Deduplicate Pending:
  - If an event with the same Event ID exists with Decision = Pending,
    update Received At and do not create a duplicate row.
- Sync with Calendar:
  - If an event no longer exists on Calendar but remains Pending, set:
    - Reasoning = "Event no longer exists on Calendar"
    - Decision = Cancelled

STEP 1.3: WAITING ROOM -> BLOCK LIST UPSERT ON BLOCKED (PERMANENT BLOCK)
Before other audit logic for an organizer, sync manual decisions into block list.
- If an event exists in Waiting Room DB with Decision = Blocked, ensure a matching
  record exists in Block List DB.
- Upsert rule:
  - Match by Sender (exact organizer email).
  - If found: update Reason, Auto-Blocked On = current date, Times Filtered = unchanged
  - If not found, create with: Sender, Auto-Blocked On = current date,
    Reason = "Manual block from Waiting Room", Times Filtered = 0
- Important: Block List here is classification + logging. No automatic calendar deletion.

STEP 1.5: BLOCK LIST PRE-CHECK (HARD DENY -> LOG ONLY)
Before any other audit logic, check Block List DB.
- If organizer email matches Sender:
  - Classification: Blocklisted Sender
  - Action: Log only (no decline, no delete, no remove)
  - Log a row in Waiting Room DB with Decision = Blocked
  - Increment Times Filtered on matched Block List row.
  - Stop further checks for this event.

STEP 2: IDENTITY AUDIT (CALLING THE BOUNCER)
For each external-organizer event:
1. Call SovereignBouncer tool verify_email_trust with email = organizerEmail.
2. Read shouldQuarantine (boolean) and verdict (string).
3. If shouldQuarantine = true OR the tool call fails:
   - Classification: Identity Phantom
   - Action: Log only (no decline, no delete, no remove)
   - Log a row in Waiting Room DB with Decision = Pending
   - Stop processing this event.

STEP 3: PROJECT RELEVANCE CHECK (TITLE <-> PROJECTS DB)
For each remaining external-organizer event:
1. Compare invite title against Projects DB.
2. Match against Project Name (exact first, then close match).
3. If a match is found: Log in Waiting Room DB with Decision = Pending

STEP 4: CLOSING THE LOOP
- For events requiring verification (e.g., empty description), create a draft email (do not send).
- Update Times Triggered and Last Triggered for triggered policies in Sovereign Policy DB.
- Create a page titled "Sovereign Security Log - YYYY-MM-DD" under Daily Briefs with:
  - Summary
  - Identity Phantoms Logged
  - Project-Related Invites Logged
  - System Health
  - Action Required (links to Waiting Room when applicable)

ABSOLUTE RULES
- Never decline invites automatically.
- Never delete or remove calendar events automatically.
- Do not attempt to use sendUpdates=false (no calendar modifications).
- Fail secure: if any tool errors, log the event in Waiting Room DB with:
  - Decision = Pending
  - Reasoning = "SYSTEM ERROR: [Error Name] - Flag for Review"
- Maintain an executive, concise tone in the daily brief.
```

</details>

---

### 🏗️ The Data Schema (State Management)

Four Notion databases maintain the complete operational state of the system:

**📥 Waiting Room DB** — the quarantine queue and human decision surface

| Property | Type | Purpose |
|---|---|---|
| Email Subject | title | Event name |
| Sender | email | Organizer email |
| Received At | date | Event start datetime |
| Decision | select | `Pending` → `Approved / Rejected / Blocked / Cancelled` |
| Reasoning | text | Policy verdict and AI reasoning |
| Calendar ID | text | Calendar identifier |
| Event ID | text | Unique event identifier (dedup key) |
| Event Link | url | Deep link to calendar event |
| Event Start | date | Scheduled start time |

**🚫 Block List DB** — permanent sender registry

| Property | Type | Purpose |
|---|---|---|
| Sender | title | Organizer email (match key) |
| Auto-Blocked On | date | When block was applied |
| Reason | text | Why this sender is blocked |
| Times Filtered | number | Cumulative block count |

**📂 Projects DB** — Ghost Project detection context

| Property | Type | Purpose |
|---|---|---|
| Project Name | title | Matched against invite titles |
| Deadline | date | Project deadline |
| Keywords | text | Tags for fuzzy matching |
| Owner | person | Project owner |
| Status | status | `Completed` or `Archived` triggers Ghost Hunter |

**🛡️ Sovereign Policy DB** — the living constitution

| Property | Type | Purpose |
|---|---|---|
| Policy Name | title | P1 / P2 / P3 |
| Rule | text | Trigger condition |
| Action | select | `Silent Quarantine` / `Request Verification` |
| Active | checkbox | Enable/disable per policy |
| Last Triggered | date | Audit trail |
| Times Triggered | number | Enforcement counter |

---

### 1. Deterministic policy enforcement

The Custom Notion Agent operates from explicit policy records in the **🛡️ Sovereign Policy DB** — `P1: Identity Proof`, `P2: Ghost Hunter`, `P3: Context Tax` — rather than ad-hoc AI judgment. Policies are readable and editable by any team member directly in Notion.

![Sovereign Policy DB](https://raw.githubusercontent.com/olawolemoses/sovereign-attention-firewall/main/assets/placeholders/sovereign-policy-db.png)

---

### 2. Persistent operational memory

The **📥 Waiting Room DB** stores event metadata, policy reasoning, and decision state across every interaction. Nothing disappears into a black box — every triage decision is traceable over time.

![Waiting Room DB](https://raw.githubusercontent.com/olawolemoses/sovereign-attention-firewall/main/assets/placeholders/waiting-room-db.png)

---

### 3. Human-in-the-loop governance

A human updates the Decision property in the **📥 Waiting Room DB**, which activates the configured automation trigger chain. The Agent Constitution enforces a **State Lock**: once a human decision is recorded in Waiting Room, the Custom Notion Agent does not re-audit that event.

When Decision is set to `Blocked`, the Waiting Room trigger runs a Notion automation that upserts the sender into **🚫 Block List DB** with full metadata. This is distinct from the Zapier trigger path, which executes calendar and inbox enforcement actions for the event.
![Waiting Room Automation Trigger — Blocked](https://raw.githubusercontent.com/olawolemoses/sovereign-attention-firewall/main/assets/waiting-room-automation-trigger-blocked.png)

![Notion Automation — Blocked → Block List DB](https://raw.githubusercontent.com/olawolemoses/sovereign-attention-firewall/main/assets/placeholders/block-list-db.png)


---

### 4. Context-aware Ghost Project detection

The **📂 Projects DB** allows the Custom Notion Agent to match incoming meeting invites against archived or completed project context. A meeting tied to a project marked `Archived` in Notion is automatically treated as a Ghost Project — no manual flagging required.

![Projects DB](https://raw.githubusercontent.com/olawolemoses/sovereign-attention-firewall/main/assets/placeholders/projects-db.png)

---

### 5. Automated enforcement with clean separation of concerns

Notion decides. Zapier enforces.

When a Decision is updated in the **📥 Waiting Room DB** (for example `Approved`, `Rejected`, `Blocked`, or `Cancelled`), that change triggers the Zapier webhook route for execution.

![Waiting Room Automation Trigger — Zapier](https://raw.githubusercontent.com/olawolemoses/sovereign-attention-firewall/main/assets/waiting-room-automation-trigger-zapier.png)

![Zapier Enforcement Structure](https://raw.githubusercontent.com/olawolemoses/sovereign-attention-firewall/main/assets/Zapier-Enforcement-Structure.png)


Three enforcement paths execute based on the human's decision in Notion:

**Path A — Block/Reject:** Delete the calendar event silently (`sendUpdates: false`) + find and delete the source email. No activity signal leaks to the sender.

**Path B — Approve:** Mark the event as accepted via a `PATCH` request, preserving full event metadata.

```typescript
export async function updateEventStatusToAccepted({
  calendarId,
  eventId
}: {
  calendarId: string;
  eventId: string;
}): Promise<{ result: string }> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`;

  const requestBody = {
    attendees: [
      {
        email: calendarId,
        responseStatus: "accepted"
      }
    ]
  };

  const response = await fetchWithZapier(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  await response.throwErrorIfNotOk();
  return { result: "Attendee response status updated to 'Accepted'" };
}
```

**Path C — Cancel:** Update RSVP to declined, signaling a professional boundary without ghosting.

```typescript
export async function updateEventRSVPStatus({
  calendarId,
  eventId
}: {
  calendarId: string;
  eventId: string;
}): Promise<{ result: any }> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`;

  const requestBody = {
    attendees: [
      {
        email: calendarId,
        responseStatus: "declined"
      }
    ]
  };

  const response = await fetchWithZapier(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  await response.throwErrorIfNotOk();
  return { result: await response.json() };
}
```

---

### 6. Security-aware silent enforcement

`sendUpdates: false` on all rejection actions ensures unverified senders never receive confirmation that your email address is active. This prevents the sender verification loops that most calendar tools inadvertently create.

---

### 7. Daily security intelligence

The **Sovereign Security Log** auto-generates a daily brief in Notion — phantoms blocked, ghost projects defended, system health status — giving you full situational awareness without opening a dashboard.

![Sovereign Security Log](https://raw.githubusercontent.com/olawolemoses/sovereign-attention-firewall/main/assets/placeholders/sovereign-security-log.png)

---

**Core insight:**
Most productivity systems optimize *scheduling*. The **Sovereign Attention Firewall optimizes attention defense** — combining edge policy execution (Cloudflare Workers), governance memory (Notion), and action enforcement (Zapier) into a system where your calendar is treated as a security perimeter, not an open invitation.

---

## Your Turn

I'd love to hear from the community:

1. **How do you currently handle calendar spam and unsolicited vendor invites?** Is this a problem you've solved, or one you've accepted?
2. **Where would you draw the human-in-the-loop line?** At what trust level would you feel comfortable letting the AI auto-reject without your review?
3. **What's missing from this system?** What would make the Sovereign Attention Firewall genuinely useful for your workflow?

---
