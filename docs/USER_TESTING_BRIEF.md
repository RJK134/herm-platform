# HERM platform — user testing brief

A guided testing pass for colleagues before monetisation. You will assume a persona, work through the scenarios that persona would realistically run, and report back using the template at the end. Claude ingests that template directly — good reports become triage tickets.

---

## Before you start

1. **Login:** `demo@demo-university.ac.uk` / `demo12345` at the local URL the tester shared with you. This account has `INSTITUTION_ADMIN` role.
2. **All Enterprise features are enabled for this testing window** (via the `DEV_UNLOCK_ALL_TIERS` flag). Do not assume a free-tier restriction you encounter is by design — report it.
3. **Keep your browser devtools open.** The Network tab reveals the `x-request-id` response header on every API call. Include it in any bug report touching a 5xx.
4. **One feedback block per finding.** Five distinct minor issues → five blocks. Do not batch.

---

## Personas

### Priya — Head of IT Procurement, UK research university
*Russell Group, ~25k students. Currently running Banner + Oracle Financials, both ageing. Board has approved a 3-year SIS replacement programme.*
- **Goals:** produce a board-ready shortlist; prove due diligence against UCISA HERM; estimate 5-year TCO; understand migration risk.
- **Pains:** previous procurement derailed by a surprise integration requirement; board wants numbers, not vendor marketing.
- **Primary surfaces:** leaderboard, radar comparison, basket builder, procurement projects, export/document generation, research hub.

### Marcus — SIS Administrator, post-92 university
*~18k students, SITS estate, small team (3 FTE). Knows the domain cold.*
- **Goals:** assess system capabilities at the capability-code level (e.g. BC011 Admissions); verify that scoring matches his real-world experience; spot gaps in the framework itself.
- **Pains:** abstract scores without evidence; vendor-supplied scores that don't match reality.
- **Primary surfaces:** capability heatmap, single-system detail, framework browser, AI Assistant (deep capability questions), vendor data accuracy.

### Rachel — FE Procurement Officer, large college group
*6 sites, ~12k learners, under DfE funding rules. Budget much tighter than HE.*
- **Goals:** compare against FHE framework specifically; get defensible cost modelling; check suppliers meet UK public-sector compliance; generate an ITT-ready specification.
- **Pains:** HE-first tooling that ignores FHE realities; no budget for pilots; procurement regulations.
- **Primary surfaces:** framework switcher (UCISA FHE), basket builder, TCO/procurement docs, compliance filters.

### Daniel — Vendor Solutions Architect (partner side)
*Works for a vendor that lists on the platform. Updates the vendor's system scores; responds to RFIs.*
- **Goals:** keep his company's capability scores accurate; submit new version data; track which institutions are evaluating his product.
- **Pains:** duplicate data entry across RFI platforms; no visibility into how his scores render to buyers.
- **Primary surfaces:** vendor portal, version submission, preview of how institutions see his system.

Pick one persona before starting. Stay in character — if Rachel never uses framework mapping in her day job, don't test it as Rachel. File a separate pass as a different persona for the surfaces your first persona wouldn't touch.

---

## Scenarios

Each step lists an **expected outcome**. Mark each pass (✓), fail (✗), or skip (–) inline in your report. Time-box each scenario to ~10 minutes — if you can't reach the expected outcome in that time, that's itself a finding.

### 1. First-run & auth — *all personas*

1. Open the site in a **fresh incognito window**. You should land on login, not a blank page or a crash.
2. Log in as demo. You should land on a dashboard within 2 seconds.
3. `GET /api/auth/me` should populate the sidebar with your institution name and tier ("Enterprise" during this testing window).
4. Log out (top-right menu). You should return to the login page with no residual state.
5. Try to visit a protected route (e.g. `/basket`) directly without logging in. You should be redirected to login and, after login, forwarded to `/basket`.
6. Try login with deliberately wrong password 3×. You should see a clear error — not a generic 500.
7. Try registering a fresh account (different email, fake institution name). You should be logged in as a new Institution Admin on a new institution.

### 2. Browse — *Priya, Marcus*

1. Navigate to the leaderboard. All listed systems should render a score; none should show "NaN" or "–" for the overall score.
2. Sort by overall score descending, then ascending. The top/bottom should swap.
3. Filter by category if the UI exposes it (e.g. HE vs FE). Counts should update.
4. Open the radar comparison. Add 5 systems. The radar should show 5 overlapping polygons, legend labels clickable to toggle.
5. Attempt to add a **6th** system. The UI should cap or warn — not silently accept and break.
6. Open the capability heatmap. Cells should be readable; hover should show a tooltip with the capability code.
7. Click through to a single system detail page. Header, version info, capability table, strengths/weaknesses should all render without placeholder text.

### 3. Build a basket — *Priya, Rachel*

1. Go to `/basket`, create a new basket. Name it "Test basket - <your name>".
2. Add ≥ 8 capabilities spanning at least 3 HERM domains (or FHE domains if testing as Rachel).
3. Evaluate the basket against ≥ 3 systems. The coverage score per system should be deterministic — reload the page; the same scores should appear.
4. Re-weight one capability from "Must-have" to "Nice-to-have". The overall coverage should recompute. The scores that drop should be the ones that were scoring low on that specific capability before the reweight.
5. Save. Leave the page and come back — your basket should persist.
6. Delete the basket from the list. It should be removed, not just hidden.

### 4. Procurement workflow — *Priya, Rachel*

1. Create a procurement project. Link the basket from scenario 3.
2. Set jurisdiction (UK public sector / DfE).
3. Progress through the stages offered (discovery → shortlist → ITT / RFI → evaluation).
4. At a stage that offers a generated document, generate it. It should open a preview and offer download.
5. Verify the generated document names the systems from your basket and reflects the jurisdiction selected. Placeholder text ("{{system_name}}") is a bug.

### 5. Research hub — *Marcus*

1. Open the research hub. Filter by publisher; counts and list both update.
2. Filter by category; list updates.
3. Filter by tag (e.g. "accessibility"); list updates.
4. Clear filters; return to full list.
5. Open any item; the article/abstract page renders without truncation mid-word.

### 6. AI Assistant — *Marcus, Priya*

1. Open `/assistant` and log in if prompted.
2. Ask: **"Which systems cover BC011 best, and what evidence supports the top scorer?"** The reply should cite at least one specific system by name and reference BC011 (or the current framework's equivalent admissions code). A generic "I don't have that data" reply is a finding.
3. Follow up: **"Compare those to the second-placed system on data migration risk."** The reply should stay on thread — multi-turn context.
4. Refresh the page. Your session history should still be visible in the sidebar.
5. Start a new session. The prior session should remain separately accessible.
6. Ask a deliberately off-topic question (e.g. "what's a good lasagne recipe?"). The assistant should politely decline or redirect to its purpose, not make something up.

### 7. Admin — *Priya (Institution Admin role)*

1. Open the admin area (sidebar). Manage users: you should see the seeded demo user and be able to invite another (even if email sending is stubbed).
2. Change a user's role; the badge updates.
3. Manage vendors (if visible to Institution Admin at all — it may be SUPER_ADMIN only, which is fine as long as the UI doesn't crash for you).
4. Try to navigate to a SUPER_ADMIN-only page directly. You should get a clear "access denied", not a blank page or a crash.

### 8. Vendor portal — *Daniel*

*You will need to log in as a vendor user. Ask the tester running the session to provision one, or use the seeded vendor if available.*
1. Log in as vendor. Land on the vendor portal, not the institution dashboard.
2. View your system's current scores.
3. Submit an updated score for one capability with a rationale ≥ 30 chars. It should enter a pending/review state — not publish immediately.
4. View your system as an institution would see it (preview). The preview should reflect the pre-change state until your update is approved.

### 9. Cross-framework — *Rachel*

1. Open the framework switcher. Switch from UCISA HERM (default) to UCISA FHE.
2. The leaderboard, scores, and capability list should update to the FHE framework.
3. **Known issue, please confirm it's still present:** FHE may have empty or placeholder data — note which pages blank out vs which show "No data" gracefully vs which error.
4. Switch back to HERM. Previous state should restore cleanly.

### 10. Enterprise-only surfaces — *Priya*

*Only exercisable during this testing window because of the tier-unlock flag.*
1. Open Framework Mapping (`/framework-mapping`). The page should load; no "Upgrade to Enterprise" blocker.
2. Select a source framework + target framework. Mappings should render.
3. Open Sector Analytics if present. Charts render.
4. Open API Keys / Team Workspaces if present. Pages render — not 403, not access-denied card.

---

## What to look for

- **Crashes / 5xx:** any blank page, generic "Something went wrong", or 500 in the network tab.
- **Slow interactions:** anything over 2s with no loading indicator.
- **Data that doesn't match reality:** scores that feel wrong for systems you know.
- **Broken navigation:** back button, deep-linking, refresh mid-flow.
- **Accessibility:** keyboard-only navigation, screen-reader labels on critical controls.
- **Copy / jargon:** wording that only makes sense to the authors. Rachel should be able to read the HE-first copy without translating.

---

## Feedback template

Copy one of these per finding. Paste directly into Claude Code — it understands this format.

```markdown
## [CATEGORY] Short title
- **Persona / role used:** Priya (HE Procurement Lead)
- **Page / URL:** /basket
- **Browser + OS:** Chrome 129 on macOS 14
- **Severity:** Blocker / High / Medium / Low / Nit
- **Scenario:** 3.4 (re-weight)
- **Steps to reproduce:**
  1. Log in as demo
  2. Open /basket, create "Test basket"
  3. Add 8 capabilities
  4. Change capability weight from "Must-have" to "Nice-to-have"
- **Expected:** Overall coverage recomputes; scores shift.
- **Actual:** Coverage number blanks out for 3 seconds, then snaps back to the pre-change value.
- **Request ID (if 5xx):** `x-request-id: 9c2a…` from the Network tab
- **Server log snippet:** paste the line matching the request-id
- **Screenshot / screencast:** (optional link)
- **Your suggestion, if any:** looks like the mutation doesn't invalidate the coverage query cache.
```

**Valid CATEGORY values:** `BUG`, `UX`, `PERF`, `DATA`, `A11Y`, `COPY`, `SECURITY`, `DESIGN`.

**Severity guidance:**
- **Blocker** — can't complete the scenario; other users can't either.
- **High** — completes the scenario but wrong / misleading / broken in a way a customer would notice.
- **Medium** — works but with rough edges a customer would forgive.
- **Low** — polish.
- **Nit** — personal preference; flag for discussion only.

---

## How to feed this back to Claude

Paste one or more feedback blocks into Claude Code, then one of:

- **Just triage:** "Triage these N findings. Group by likely root cause. For each, estimate effort in S/M/L and tell me which you'd fix first."
- **Fix the easy ones:** "Triage, then fix everything marked Blocker or High that you're >80% confident you can do without breaking tests. Open a draft PR per logical group."
- **Investigate one:** "Investigate [title] end-to-end. Reproduce locally, find the root cause, propose a fix before writing any code."

Claude will read the `x-request-id` and grep the server logs; it will match persona + scenario to the relevant code path; it will run tests before and after. Structured reports get structured action.

---

## Out of scope for this pass

- Load / stress testing.
- Security penetration testing.
- Multi-tenant data isolation proofs (handled separately).
- Mobile responsiveness unless the report explicitly notes viewport.
