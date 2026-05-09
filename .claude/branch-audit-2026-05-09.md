# Branch audit — 2026-05-09

Read-only audit of `RJK134/herm-platform` remote branches. No deletions or pushes performed.

Default branch: `master` (HEAD `133fb16` — "Phase 14 demo-impact bundle (#101)")
Total branches on origin: 5 (master + 4 non-default)

## Summary table

| Category | Count | Branches |
|---|---:|---|
| PROTECTED (default) | 1 | `master` |
| AHEAD-PR-OPEN | 1 | `claude/p14-overnight-queue` |
| AHEAD-NO-PR | 1 | `claude/p11-19-deploy-copilot-fixes` |
| DISCONNECTED HISTORY | 2 | `copilot/code-review-academic-management`, `copilot/review-and-reconcile-branches` |
| MERGED (zero unique) | 0 | — |
| STALE-EMPTY | 0 | — |
| AHEAD-PR-CLOSED | 0 | — |
| DIVERGED | 0 (none with shared ancestor) | — |

The two `copilot/*` branches do **not share any common ancestor with master** — `git merge-base origin/master origin/copilot/...` returns empty. They are orphan history (likely the original repo state before a force-push / squash rewrite). They are **not** mergeable in the usual sense and **not** classifiable as DIVERGED in the standard way; they are fully independent.

## Recommended actions

### Auto-delete-safe (zero remaining work)

None. There are no purely-merged-with-zero-unique branches in the remote.

### Open-PR candidates

`claude/p11-19-deploy-copilot-fixes` — has one unique commit `0daec42` ("fix(deploy,db): unblock prisma-validate + Copilot review fixes", 2026-05-03 18:42 UTC) added **after** PR #93 was already merged on 2026-05-03 12:58. The other unique commit `bc19e5d` is cherry-equivalent to a commit on master (already merged). If `0daec42` is unwanted leftover, the branch is safe to delete; if it's deferred work, it needs a fresh PR.

### Needs review (do NOT auto-delete)

`copilot/code-review-academic-management` (18 unique commits, last activity 3 weeks ago) and `copilot/review-and-reconcile-branches` (24 unique commits, last activity 2 weeks ago) — these are **disconnected** from master's history. Their commits include:

- `feat: Phase 1 & 2 — full-stack HERM platform foundation + intelligence layer`
- `feat: Phase 3 - TCO calculator, procurement workflow, integration assessment`
- `feat: Phase 4 - JWT authentication, multi-tenancy, subscription model`
- `feat(phase-3): Architecture Assessment, Value Analysis, Document Generator`
- `feat: Phase 5 - vendor portal, Stripe subscriptions, team workspaces, vendor management`
- `feat: Phase 6 - i18n (5 languages), security hardening, sector analytics, notifications, API keys, launch polish`
- `fix(security): Phase 1 critical security fixes` / `Phase 2 high-priority fixes`
- `Production-readiness hardening pass (#3)` / `Production readiness: quality gates, API hardening, observability, docs (#2)`
- `feat: multi-framework support + family→domain rename (#5)`

These commit messages describe **load-bearing foundational work**. The current master clearly has equivalent functionality (HERM v3.1 with 165 capabilities, multi-framework, SSO, SCIM, Stripe, i18n, etc.), so the work appears to have been carried forward — but **by squash / rewrite, not by merge**. `git cherry` reports every commit on these branches as "+" (no equivalent diff in master), which is normal for squash-merged history but indistinguishable from genuine loss without a manual diff against master tip.

**Recommendation:** Before deletion, verify that everything these branches contain is reflected in `master`'s working tree, e.g.:

```sh
git diff origin/copilot/code-review-academic-management origin/master -- '*.ts' '*.prisma'
git diff origin/copilot/review-and-reconcile-branches origin/master -- '*.ts' '*.prisma'
```

If the diffs only show *expected* drift (master has more features, identical core), they are safe to delete. If anything load-bearing exists only on those branches, file an issue first.

### Leave alone (handled elsewhere)

`claude/p14-overnight-queue` — open PR #102, auto-merge handled in normal review flow. 1 commit ahead of master, 0 behind.

## Per-branch detail

### `claude/p11-19-deploy-copilot-fixes`
- **Classification:** AHEAD-NO-PR
- **Ahead / behind master:** 2 / 12
- **Last commit:** 2026-05-03 18:42 UTC by `Claude` (`0daec42`)
- **Unique commits vs master:**
  - `0daec42` fix(deploy,db): unblock prisma-validate + Copilot review fixes — **NOT in master**
  - `bc19e5d` fix(deploy): address Copilot review on PR #90 — cherry-equivalent on master
- **PR linked:** #93 (closed, merged 2026-05-03 12:58 UTC)
- **CI:** N/A (PR already closed)
- **Notes:** The branch was kept after merge; `0daec42` was added 6h after the merge and never PR'd.

### `claude/p14-overnight-queue`
- **Classification:** AHEAD-PR-OPEN
- **Ahead / behind master:** 1 / 0
- **Last commit:** 2026-05-08 22:43 UTC by `Claude` (`c0def3a`)
- **Unique commits vs master:**
  - `c0def3a` docs(phase-14): paste-ready overnight queue for the seven deferred sub-phases
- **PR linked:** #102 (open)
- **CI:** Not inspected (open PR, normal review flow)

### `copilot/code-review-academic-management`
- **Classification:** DISCONNECTED HISTORY (no common ancestor with master)
- **Ahead / behind master:** 18 / 56 (counts on independent histories)
- **Last commit:** 2026-04-20 17:41 +0200 by `RJK134` (`0b5d4b1`)
- **Total commits on branch:** 18
- **Unique commits vs master (all of them):** Phase 1 → Phase 6 foundational features, including platform refresh, security hardening, BUGBOT config, multi-framework rename. See "Needs review" section above for the commit list.
- **PR linked:** None
- **Notes:** Branch references the original (pre-rewrite) repo history. Functionality appears carried forward into master via squash, but bit-for-bit verification has not been done.

### `copilot/review-and-reconcile-branches`
- **Classification:** DISCONNECTED HISTORY (no common ancestor with master)
- **Ahead / behind master:** 24 / 56 (counts on independent histories)
- **Last commit:** 2026-04-22 13:07 +0200 by `RJK134` (`feb4ebd`)
- **Total commits on branch:** 24 (includes all 18 from `copilot/code-review-academic-management` plus 6 newer ones tagged `(#9)`, `(#8)`, `(#7)`, `(#6)`, `(#3)`, `(#2)`)
- **Unique commits vs master (all of them):** Same Phase 1–6 history, plus `Production-readiness hardening pass (#3)`, `fix: AI prompt framework-aware (#7)`, `fix(seed): unblock npm run db:seed (#8)`, `fix(dev): align Postgres/Redis ports + harden start.bat (#9)`.
- **PR linked:** None
- **Notes:** Looks like a superset of `copilot/code-review-academic-management` — likely a follow-on Copilot session. Same disconnected-history caveat applies.

## Risk flags

1. **Disconnected-history branches** (`copilot/code-review-academic-management`, `copilot/review-and-reconcile-branches`) — commit messages describe major foundational features. `git cherry` cannot tell us whether the work is in master because the histories don't share an ancestor; only a working-tree diff can. **Do not delete without manual verification.**
2. **`0daec42`** on `claude/p11-19-deploy-copilot-fixes` — appears unique, no PR, 6 days old. Risk: low (one targeted fix), but worth a glance before deletion.
3. **No 90-day-stale branches** — the oldest unmerged ref is 19 days old.
4. **No closed-but-unmerged PRs** in scope — every closed PR in the queryable set was merged.
5. **No branches show "valuable" feat:/BREAKING markers in unique commits except the disconnected-history branches** — those are flagged above.

## Constraints honoured

- No `git push`, no deletions, no PRs created, no merges performed.
- No branch protection API call attempted (no `gh` CLI available; inferred from naming and CLAUDE.md conventions).
- All findings derived from `git fetch --all --prune`, `git rev-list`, `git log`, `git cherry`, `git merge-base`, and a `mcp__github__list_pull_requests` call cross-referenced against `head.ref`.
