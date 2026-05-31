# EZPM — Maintenance Requests (design plan)

Status: **design-reviewed, ready for eng-review + implementation.** Produced by
`/plan-design-review`. No code written yet.

Hard constraint: **purely additive.** New tables, new pages, new storage, new
notify/email helpers only. ZERO changes to Stripe, auth, webhooks, or the
payments data model. Safe to build while the $1 live test runs.

---

## What we're building

A maintenance-request feature for the tenant portal. A tenant reports an issue
(title + category + priority + description + photos), and the request becomes a
living thread: tenant and landlord add comments/photos over time, status moves
`open → in_progress → resolved`. The landlord gets a Mattermost ping on new
requests; the tenant gets a branded email on every status change.

Why this and not chat: for a 3-tenant owner-operated portal where the landlord
knows every tenant, the value a text message can't provide is a **timestamped,
photo-backed record with status**. That's the whole point.

---

## Decisions locked (this review)

| # | Decision | Choice |
|---|---|---|
| D1 | Capability | Maintenance requests + photo upload |
| D1 | Storage | Plain disk volume on the app container |
| D2 | Interactivity | Updates thread (status timeline + two-way comments/photos) |
| D2 | Triage | Light — category + priority on the request |
| D2 | Notifications | Both — Mattermost ping on new request + themed email to tenant on status change |

## Eng-review decisions (added by /plan-eng-review)

| # | Decision | Choice |
|---|---|---|
| Scope | Build all at once vs phase | **Phase it.** Phase 1 = report + photos + status + notifications (~14 files). Phase 2 = the updates thread (`maintenance_updates` + thread UI). |
| A1 | Storage & file-serving security | **Hardened spec:** write only to the mounted volume (env `UPLOADS_DIR`, never container FS / never `public/`); validate size + content-type **server-side** (client checks are UX only); store files as `<uuid>.<ext>` with the original name kept only as a DB column (path-traversal safe); serve via `GET /api/.../maintenance/attachments/[id]` that loads attachment → request → asserts `tenant_id == session` (or admin) before streaming. Never a guessable public URL. |
| A2 | Replicas | Single-replica assumption documented. Local disk doesn't shard across replicas; home deploy is single-replica. MinIO is the scale escape hatch (deferred). |
| CQ1 | Email DRY | Extract a shared `emailLayout({ heading, bodyHtml })` helper in `lib/email.ts` (owns DOCTYPE, palette consts, "ez" seal header, card, footer). `renderReceiptEmail` is refactored onto it; `renderMaintenanceStatusEmail` reuses it. One source of truth for brand chrome. |
| T1 | Test floor | Add **Vitest** + cover the **6 security-critical paths only**: file-serve ownership (A≠B, unauth→401, admin ok), server-side size + type rejection, UUID/path-strip. CRUD + component tests deferred. |
| P1 | List query | Photo counts via a single grouped query (`group by request_id`), not per-row (no N+1). |

Phase 1 is what gets built next; Phase 2 (thread) is a follow-up branch.

---

## Data model (new tables — additive only)

```sql
-- A maintenance request raised by a tenant.
CREATE TABLE maintenance_requests (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    category    VARCHAR(30)  NOT NULL DEFAULT 'other',   -- plumbing|electrical|appliance|hvac|other
    priority    VARCHAR(10)  NOT NULL DEFAULT 'normal',  -- normal|urgent
    status      VARCHAR(20)  NOT NULL DEFAULT 'open',     -- open|in_progress|resolved|cancelled
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,
    CONSTRAINT mr_category_check CHECK (category IN ('plumbing','electrical','appliance','hvac','other')),
    CONSTRAINT mr_priority_check CHECK (priority IN ('normal','urgent')),
    CONSTRAINT mr_status_check   CHECK (status IN ('open','in_progress','resolved','cancelled'))
);
CREATE INDEX idx_mr_tenant ON maintenance_requests(tenant_id);
CREATE INDEX idx_mr_status ON maintenance_requests(status);

-- The thread: comments + status changes, from tenant or admin.
CREATE TABLE maintenance_updates (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id    UUID NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
    author_role   VARCHAR(10) NOT NULL,                  -- tenant|admin
    author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    body          TEXT,
    status_change VARCHAR(20),                           -- set when this update changed status
    created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT mu_author_check CHECK (author_role IN ('tenant','admin'))
);
CREATE INDEX idx_mu_request ON maintenance_updates(request_id);

-- File attachments (photos/PDFs) on the initial request or on a thread update.
CREATE TABLE maintenance_attachments (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id       UUID NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
    update_id        UUID REFERENCES maintenance_updates(id) ON DELETE CASCADE,
    file_path        TEXT NOT NULL,            -- relative path on the disk volume
    file_name        VARCHAR(255) NOT NULL,
    content_type     VARCHAR(100) NOT NULL,
    size_bytes       INTEGER NOT NULL,
    uploaded_by_role VARCHAR(10) NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ma_request ON maintenance_attachments(request_id);
```

## Storage (disk volume)

- New Docker volume `ezpm-uploads` mounted at `/app/uploads` on the EZPM app
  container (Coolify: add a persistent volume).
- Files stored at `uploads/maintenance/<request_id>/<uuid>-<sanitized-filename>`.
- **Served through an authenticated Next.js route, NOT a public static path** —
  these are photos of the inside of someone's home. `/api/tenant/maintenance/attachments/[id]`
  (and `/api/admin/...`) verifies the requester owns/admins the request, then
  streams the file with the right `Content-Type`. Never a guessable public URL.
- **Backups: automatic.** The nightly `opti3-backup.sh` loops `docker volume ls -q`
  and tars every volume, so `ezpm-uploads` is captured the first night after it
  exists. No backup-script change needed.

---

## Screens

### Tenant
1. `/tenant/maintenance` — request list. Cards: category icon, title, status
   badge, priority tag (urgent only), last-activity time, photo-count thumbnail.
2. `/tenant/maintenance/new` — report form (see Upload UX).
3. `/tenant/maintenance/[id]` — detail: status timeline + updates thread, add a
   comment + photos, cancel own request (open only).

### Admin
4. `/admin/maintenance` — all requests. Default filter `open`; sort urgent-first
   then newest. Shows tenant + property on each row.
5. `/admin/maintenance/[id]` — detail: change status, reply in thread, view +
   download photos.

### Dashboard integration (additive cards)
- Tenant dashboard: a "Maintenance" `lift` card showing open-request count + a
  "Report an issue" CTA.
- Admin dashboard: an "Open requests" stat card (5th stat) + quick-action card.

---

## Pass 1 — Information Architecture  (3/10 → 9/10)

Navigation: add "Maintenance" to the tenant nav (between Pay Rent and Payment
Methods) and to the admin nav (after Payments). Wrench icon (lucide `Wrench`).

Request-list hierarchy (what the eye hits first → last):
1. Status badge + title (is this open? what is it?)
2. Category icon + priority (urgent jumps out via warning color)
3. Last-activity timestamp + photo count
4. Tenant + property (admin list only)

Detail-page hierarchy:
1. Title + current status (the answer to "where's my leak at?")
2. Status timeline / updates thread (the conversation)
3. Original description + photos
4. Actions (add comment, change status, cancel)

## Pass 2 — Interaction State Coverage  (2/10 → 10/10)

| Screen | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Request list | skeleton cards | warm empty: "Nothing broken — nice. Report an issue if something comes up." + CTA | inline retry banner | n/a | n/a |
| New request form | n/a | n/a | field-level validation + inline file errors (keep valid files) | redirect to detail + toast | some photos uploaded, one failed → show which, let retry |
| Photo upload | per-file progress bar | "Add photos (optional)" dropzone | "Too large (max 10MB)" / "Type not supported" / "Upload failed — retry" inline per file | green check per thumbnail | mixed: succeeded files stay, failed flagged |
| Request detail | skeleton thread | n/a (always has the request) | "Couldn't load — retry" | comment posts, appears in thread optimistically | comment text saved but photo failed → flag |
| Admin list | skeleton rows | "No open requests." (filter-aware) | retry banner | n/a | n/a |
| Status change | button spinner | n/a | "Couldn't update status — retry" | badge updates + email fires | n/a |

Empty state is a feature: warm copy, a clear primary action, never a bare "No
results."

## Pass 3 — User Journey & Emotional Arc  (4/10 → 9/10)

| Step | Tenant does | Feels | Design supports it |
|---|---|---|---|
| 1 | Notices a leak | annoyed, wants it handled | Mobile-first "Report an issue" reachable in 1 tap from dashboard |
| 2 | Snaps photos in the form | "is this enough?" | Camera capture on mobile, multi-photo, previews so they SEE proof attached |
| 3 | Submits | hopeful but unsure | Confirmation screen + "We've got it — you'll get an email on any update" |
| 4 | Waits | anxious if silent | Status moves to `in_progress` → themed email; thread shows landlord's note |
| 5 | Issue fixed | relief / closure | `resolved` email + thread shows resolution; request archives cleanly |

Time horizons: 5-sec (report fast on a phone), 5-min (clear status + thread),
5-year (every request is a dated, photo-backed record neither side loses).

## Pass 4 — Upload UX + AI-slop check  (mobile-first; no slop)

Upload control (the crux — tenants photograph issues on phones):
- `<input type="file" accept="image/*,application/pdf" multiple capture="environment">`
  → opens the camera on mobile, file picker on desktop.
- Desktop: drag-and-drop dropzone + click-to-browse.
- Client validation: types `jpg/png/webp/heic/pdf`; max **10MB/file**, max **6 files**.
- Thumbnail previews with remove (X); per-file upload progress; per-file error
  that doesn't nuke the other files.
- **HEIC caveat (risk):** iPhones shoot HEIC, which many browsers won't preview.
  v1 accepts and stores as-is (download works; inline preview may fall back to a
  file-type icon). Server-side conversion to JPEG (sharp) is a deferred polish.

No AI slop: reuse the existing card/list patterns, not a 3-column feature grid.
Category icons are functional (scanning), not decorative. No hero, no centered-
everything, no colored-left-border cards.

## Pass 5 — Design System Alignment  (reuse the cream/teal system)

Reuse: `Card`, `Button`, `Badge`, `Input`, the cream/teal tokens, Fraunces
headings, the `lift` hover. Status → Badge variant:

| Status | Badge variant | Meaning |
|---|---|---|
| open | `warning` (amber) | needs attention |
| in_progress | `accent` (teal) | being worked |
| resolved | `success` (green) | done |
| cancelled | `outline` (muted) | withdrawn |

New components (small, fit the vocabulary):
- `FileDropzone` — the upload control above.
- `StatusTimeline` — vertical timeline of thread updates + status changes.
- `categoryIcon(category)` — lucide icon map (Droplet/Zap/Refrigerator/Wind/Wrench).

No new colors. No DESIGN.md exists, but the shipped cream/teal/Fraunces system +
getezpm.com IS the design language; this calibrates against it. (Flag: writing a
DESIGN.md is worth doing eventually — deferred.)

## Pass 6 — Responsive & Accessibility  (mobile-first is the point)

- Mobile-first: the report flow is designed for a phone in a hallway by a leak.
  Single-column, big tap targets (44px min), camera capture default.
- Status conveyed by **text + color**, never color alone (colorblind-safe).
- Thumbnails have alt text ("Photo of reported issue, 1 of 3").
- File input is keyboard-reachable; dropzone has a real `<input>` behind it.
- Photo lightbox: Esc to close, focus trap, arrow keys between photos.
- Form labels visible above fields (never placeholder-as-label).

## Pass 7 — Notifications

- **New request** → `notify.maintenanceRequested(...)` → Mattermost ping to the
  landlord (extends `lib/notify.ts`, same fire-and-forget pattern).
- **Status change** → themed email to the tenant via `lib/email.ts`. New
  `renderMaintenanceStatusEmail()` reuses the **exact receipt template
  structure** (cream canvas, white card, teal "ez" seal, Georgia display, same
  table/footer) so it matches the receipt. Subject e.g. "Your maintenance
  request is now In Progress."
- (Deferred: tenant reply → Mattermost ping; landlord reply → tenant email.
  v1 keeps it to new-request + status-change to avoid noise.)

---

## NOT in scope (deferred, with rationale)

- **Full chat/messaging** — they have phone numbers; per-request threads cover
  the record-keeping need without building a chat app.
- **Document vault** (lease/insurance storage) — separate feature; same storage
  infra will make it cheap later.
- **Push/SMS notifications** — Mattermost + email are enough for 3 tenants.
- **Scheduling/calendar, vendor assignment, cost tracking** — landlord-CRM scope,
  not warranted yet.
- **HEIC→JPEG server conversion** — v1 stores as-is; convert later if previews annoy.
- **DESIGN.md** — the de-facto system works; formalize later.

## What already exists to reuse

- UI primitives: `Card`, `Button`, `Badge` (incl. success/warning/accent),
  `Input`, `DeleteConfirmationDialog`.
- `components/layout/navigation.tsx` — add the Maintenance link (both roles).
- `lib/notify.ts` — add `maintenanceRequested`.
- `lib/email.ts` — mirror `renderReceiptEmail` for the status email.
- `lib/auth.ts` — `getCurrentTenant()` / `requireAdmin()` guards.
- Cream/teal/Fraunces design system + `lift` utility.

---

## Implementation Tasks

### Phase 1 — report + photos + status + notifications (this branch)
Build storage + data model first (they gate everything).

- [ ] **T1 (P1)** — db — `maintenance_requests` + `maintenance_attachments` tables → `supabase/schema.sql` + apply to live DB. (`maintenance_updates` is Phase 2.) Verify FKs cascade.
- [ ] **T2 (P1)** — infra — `ezpm-uploads` Docker volume mounted at `UPLOADS_DIR=/app/uploads` (Coolify). Confirm nightly backup auto-discovers it.
- [ ] **T3 (P1)** — lib — `lib/storage.ts`: mounted-volume writes only, `<uuid>.<ext>` names, strip client path, server-side size+type allowlist. (A1)
- [ ] **T4 (P1)** — api — `POST /api/tenant/maintenance`, `GET /api/tenant/maintenance/attachments/[id]` (ownership-checked stream), `PATCH /api/admin/maintenance/[id]` (admin-only). Re-validate size/type server-side.
- [ ] **T5 (P1)** — test — **Vitest** setup + 6 security tests: file-serve A≠B / 401 / admin; server-side size+type rejection; UUID/path-strip. (T1)
- [ ] **T6 (P1)** — ui — `FileDropzone` (camera capture, multi, previews, per-file progress + errors, 10MB/6-file caps).
- [ ] **T7 (P1)** — ui — Tenant screens: list (single grouped count query — P1), new-request form, detail (photos + status; no thread yet).
- [ ] **T8 (P1)** — ui — Admin screens: list (filter open / sort urgent-first), detail (status change). `categoryIcon` map + status→Badge variants.
- [ ] **T9 (P1)** — email — Extract shared `emailLayout()` in `lib/email.ts`; refactor `renderReceiptEmail` onto it; add `renderMaintenanceStatusEmail`. (CQ1)
- [ ] **T10 (P1)** — notify — `notify.maintenanceRequested` (Mattermost on new request); fire status email on admin status change.
- [ ] **T11 (P1)** — nav — Maintenance link in both navs; open-count card on both dashboards.
- [ ] **T12 (P2)** — a11y — photo lightbox keyboard nav, alt text, 44px targets, contrast.

### Phase 2 — updates thread (follow-up branch)
- [ ] **P2-T1** — db — `maintenance_updates` table; attachments can link to an update.
- [ ] **P2-T2** — ui — `StatusTimeline` + thread (comment + photo) on tenant & admin detail.
- [ ] **P2-T3** — notify/email — (optional) tenant reply → Mattermost; landlord reply → tenant email.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | (CEO lens applied inline: chose maintenance wedge over chat) |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — (codex unavailable) | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 4 issues, 0 critical gaps; scope phased; storage hardened |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (FULL) | score 2/10 → 9/10, 6 decisions added |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | n/a |

- **UNRESOLVED:** 0.
- **ENG REVIEW SUMMARY:** scope phased (Phase 1 = ~14 files, thread → Phase 2);
  A1 storage/serve security hardened; CQ1 shared `emailLayout()` extraction;
  T1 Vitest + 6 security-critical tests as the floor; P1 single grouped count
  query. No critical failure-mode gaps once A1 + T1 land.
- **FAILURE MODES:** the two that mattered (cross-tenant photo access, disk
  exhaustion via oversized upload) are closed by A1 + the 6 security tests.
- **VERDICT:** DESIGN + ENG CLEARED — ready to implement Phase 1.
