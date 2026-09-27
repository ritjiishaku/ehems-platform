# Workflow: New Programme

Use when building or modifying the admin flow that creates a programme —
its metadata, its tier mapping, its sessions, and its materials. Covers
FR-041 and FR-042.

Programmes are created repeatedly by the client, not just once at launch.
PRD §22.2 says the admin CMS must let them add programmes **without
developer involvement**. That is the design constraint: if creating a
programme requires a deploy, the workflow is wrong.

---

## The three entities

```prisma
model Programme {
  id                   String        @id @default(cuid()) @map("id")
  title                String        @map("title")
  description          String        @map("description")
  durationWeeks        Int           @map("duration_weeks")
  attendanceThreshold  Int           @default(60) @map("attendance_threshold") // percentage
  isActive             Boolean       @default(true) @map("is_active")
  createdBy            String        @map("created_by")
  createdAt            DateTime      @default(now()) @map("created_at")
  updatedAt            DateTime      @updatedAt @map("updated_at")

  sessions             Session[]
  programmeTiers       ProgrammeTier[]
  enrolments           Enrolment[]

  createdByUser        User          @relation("ProgrammeCreatedBy", fields: [createdBy], references: [id], onDelete: Restrict)

  @@index([isActive])
  @@map("programme")
}

model ProgrammeTier {
  programmeId  String    @map("programme_id")
  tierId       String    @map("tier_id")

  programme    Programme @relation(fields: [programmeId], references: [id], onDelete: Cascade)
  tier         Tier      @relation(fields: [tierId], references: [id], onDelete: Cascade)

  @@id([programmeId, tierId])
  @@map("programme_tier")
}

model Session {
  id               String        @id @default(cuid()) @map("id")
  programmeId      String        @map("programme_id")
  title            String        @map("title")
  scheduledStart   DateTime      @map("scheduled_start")
  scheduledEnd     DateTime      @map("scheduled_end")
  locationType     LocationType  @map("location_type") // physical | virtual | hybrid
  locationDetails  String?       @map("location_details")
  isActive         Boolean       @default(true) @map("is_active")

  programme        Programme     @relation(fields: [programmeId], references: [id], onDelete: Cascade)
  attendance       AttendanceRecord[]

  @@index([programmeId, scheduledStart])
  @@map("session")
}

enum LocationType { physical  virtual  hybrid }
```

These match PRD §16.2. Do not add fields speculatively. `createdBy` is a
bare `user_id` in §16.2, so it is modelled as one here — but it needs a
matching `User.programmesCreated` back-reference for `prisma generate` to
succeed, and a real relation rather than an orphan string, otherwise the
author of a programme cannot be joined to and deleting a user leaves dangling
authorship.

**The `enrolments Enrolment[]` back-reference is currently unusable.** PRD
§16.2 gives `Enrolment` a singular `programme_id` while §16.7 makes
`Programme ↔ Tier` many-to-many, and one verified payment activates exactly
one enrolment. One enrolment cannot span N programmes. Until that is
resolved, programme access is derived from the tier mapping — not from
`Enrolment` rows. See [docs/decisions.md](../../docs/decisions.md).

---

## ⚠️ Gap in the PRD: there is no Material entity

§12.1 says each programme contains "Materials: Tier-gated resources (PDFs,
videos, audio, links)." FR-032 requires members to download tier-gated
materials, and §17.1 lists a Materials API group.

**But §16 defines no `Material` entity.** There is nowhere to store them.

This needs a client decision before the materials feature is built. Two
reasonable shapes:

**Option A — materials belong to a programme:**

```prisma
model Material {
  id             String        @id @default(cuid())
  programmeId    String
  title          String
  description    String?
  materialType   MaterialType  // pdf | video | audio | link
  url            String
  tierId         String?       // null = all tiers in the programme
  displayOrder   Int
  isActive       Boolean       @default(true)

  programme      Programme     @relation(fields: [programmeId], references: [id])
  tier           Tier?         @relation(fields: [tierId], references: [id])

  @@index([programmeId, displayOrder])
}

enum MaterialType { pdf  video  audio  link }
```

**Option B — materials belong to a tier, shared across programmes.**
Same shape, but keyed by `tierId` and no `programmeId`.

Option A matches §12.1's wording ("each programme contains"). Option B
matches the "tier-gated" language. **The PRD supports both readings, so
ask.** Do not pick one and build — the choice affects FR-032, the member
dashboard, and the API group.

Until this is resolved, build programme and session creation. Leave
materials out.

---

## Step 1 — Create the programme

The admin fills in:

- **Title** — free text, required
- **Description** — free text, required
- **Duration in weeks** — integer, required
- **Attendance threshold** — integer percentage, default 60
- **Tier mapping** — one or more tiers (see Step 2)

### Attendance threshold

PRD §13.1 says 60% is the benchmark, "configurable" — and the line after it
grants an explicit admin override for edge cases. Default the field to 60 and
let the admin change it per programme.

**However:** BR-008 states completion requires ≥60% attendance. A threshold
below 60 is more lenient than the business rule; above 60 is stricter.

**Enforce a floor of 60 in `lib/programmes/`, not in the Zod schema.** A
schema that ships to the client discloses the rule and can be bypassed; the
authority is the `lib/` function the route delegates to. The form gets a
matching client-side check for UX ("60% is the EHEMS minimum"), and both are
tested.

**The admin override in §13.1 is not a licence to go below 60.** BR-008 is a
CONFIRMED business rule; an override for edge cases should adjust a specific
member's completion, not lower the programme-wide floor. If the client wants
sub-60 programmes, that is a change to BR-008, not a form default. Raise it
rather than implementing it.

### Duration in weeks

This is the _scheduled_ length, used for display and for calculating
whether a programme is currently running. It is not the mentorship
duration — that lives on the tier (§12.2). Do not conflate them.

## Step 2 — Map to tiers

`ProgrammeTier` is many-to-many. A programme can serve multiple tiers; a
tier can have multiple programmes.

**Only the six active tiers are selectable.** Tiers II, VI, VII are
retired (BR-016) and must not appear in the picker. Filter at the query
level:

```ts
const tiers = await db.tier.findMany({
  where: { isActive: true, isFree: false }, // excludes O'Free and retired
  orderBy: { displayOrder: "asc" },
});
```

**Should O'Free be mappable?** §11.2 says O'Free gets the weekly
sustainability class, networking sessions, and monthly Zoom growth
meetings. Those are the three benefits every tier shares, and they read
like programme content.

**Ask the client.** If O'Free members attend programmes, map them. If
those benefits are community events outside the programme system, do not.
The PRD does not say, and guessing wrong means either O'Free members see
no programmes or they see paid-tier content.

### The tier-mapping trap

Changing the tier mapping after members have enrolled is the most
dangerous edit in this workflow. See Step 6.

## Step 3 — Create sessions

Sessions are dated occurrences within the programme. Each has:

- **Title** — free text
- **Scheduled start and end** — datetime, UTC in DB, WAT in the form
- **Location type** — physical, virtual, or hybrid
- **Location details** — conditional (see below)
- **Active flag** — for cancelling without deleting

### Conditional location details

| Location type | `locationDetails`               |
| ------------- | ------------------------------- |
| `virtual`     | Required — the meeting URL      |
| `physical`    | Required — the address          |
| `hybrid`      | Required — both URL and address |

Validate this in the Zod schema with a discriminated union. An empty
`locationDetails` on a virtual session means members have no way to join.

### Scheduling rules

- **Start must be before end.** Validate.
- **End should be reasonable.** A session longer than 8 hours is almost
  certainly a data-entry error. Warn, don't block.
- **Sessions within a programme should not overlap.** Two sessions at the
  same time means members cannot attend both. Warn on overlap; allow with
  confirmation for the rare legitimate case (parallel tracks).
- **Ordering.** Display sessions by `scheduledStart ASC`. Never by
  creation order.

### Creating sessions in bulk

The client will create many sessions at once (weekly for 12 weeks). Build
the form to accept:

- A single session (default)
- A recurring series — start date, frequency, count — that generates
  multiple sessions the admin can then edit individually

**Bulk creation is not in the PRD**, but PRD §22.2 makes "no developer
involvement" a requirement, and creating 12 sessions one at a time is the
kind of friction that sends the client back to you. Build the single-
session form first; add bulk if there is time.

### Location details are free text

Do not store virtual meeting URLs in a structured field. They change
(Zoom links rotate), and they live outside the platform by design — same
principle as `CommunityLink` in
[architecture.md](../rules/architecture.md). Free text is fine.

## Step 4 — Programme lifecycle

```
draft ──▶ active ──▶ completed ──▶ archived
```

- **draft** — being set up, not visible to members
- **active** — visible, sessions running, members can be enrolled
- **completed** — all sessions done, no new enrolments, certificates issued
- **archived** — historical, hidden from default views

**Phase 1 uses `isActive: boolean` only.** The PRD's schema has no status
enum, so this is a four-state concept squeezed into a boolean. That is
workable but lossy.

**Recommendation:** add a `ProgrammeStatus` enum in a migration. It is a
small change now and a painful one later, once programmes exist in
production and "archived" is being faked by clearing `isActive`.

If you do not add the enum, be disciplined: `isActive = false` means
"hidden," and there is no way to distinguish draft from completed from
archived. Flag this to the client.

## Step 5 — Assigning members

Enrolment happens through payment verification (§8.2), not through the
programme form.

The programme form's job is to define what members _can_ enrol in. An
admin does not manually enrol a member in Phase 1 — the member subscribes
to a tier, and the tier-to-programme mapping determines what appears in
their dashboard.

**This means:** changing the tier mapping changes who can see the
programme. See Step 6.

## Step 6 — Editing a live programme

This is where mistakes happen. A programme with active enrolments is a
shared state between the admin and every enrolled member.

### Safe to edit anytime

- Title, description — cosmetic
- Session titles — cosmetic
- Adding new sessions — additive
- Deactivating a future session — members see it removed

### Requires care

| Edit                             | Risk                                                      | Handling                                                                |
| -------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Changing attendance threshold    | Changes completion eligibility mid-flight                 | **Warn explicitly.** Prefer applying to new enrolments only. See below. |
| Changing duration weeks          | Cosmetic after start; misleading to members               | Warn.                                                                   |
| Changing a session's datetime    | Members may have planned around it                        | Warn. Require confirmation.                                             |
| Changing a session's location    | Members may travel to the wrong place                     | Warn. Require confirmation.                                             |
| Removing a tier from the mapping | Enrolled members lose access to a programme they paid for | **Warn and require confirmation.** See the trap below.                   |
| Adding a tier to the mapping     | **Existing members on that tier gain the programme**      | Warn. Not a no-op — see below.                                         |
| Deactivating the programme       | Members see nothing                                       | Warn and require confirmation.                                          |

### The attendance threshold change

If a programme is in flight and the admin lowers the threshold from 70%
to 60%, members who were failing suddenly pass. If they raise it from 60%
to 80%, members who were on track now fail.

**The PRD does not specify.** The safest behaviour:

- Store the threshold on the programme **and snapshot it onto each
  enrolment at creation** (`Enrolment.attendanceThreshold`).
- Completion is evaluated against the enrolment's snapshot, not the
  programme's current value.
- A threshold change applies to new enrolments only.

This is an addition to the §16.2 schema. Flag it to the client — it is a
small change now, and a fairness problem later.

### The tier-removal trap

An admin removes Advanced V from a programme. Fifty members on Advanced V
are enrolled in it. Their dashboards go blank.

**Warn and require confirmation.** Do **not** hard-block on a count of
`Enrolment` rows for this programme — that guard is structurally inert. In
Phase 1 an admin never enrols a member in a programme directly: one verified
payment creates exactly one `Enrolment`, and that enrolment has a singular
`programme_id`, so a multi-programme member has no rows to count here. The
count is always `0` and the block never fires.

Count the affected **members by tier** instead, which is the number that
actually matters:

```ts
const removedTierIds = before.filter((id) => !after.includes(id));

const affectedMembers = await db.enrolment.count({
  where: {
    tierId: { in: removedTierIds },
    status: "active",
  },
});

if (affectedMembers > 0) {
  throw new ConflictError(
    `${affectedMembers} active member(s) on the removed tier(s) will lose ` +
      `access to this programme. Deactivate the programme instead, or ` +
      `contact them first.`,
  );
}
```

This blocks on a count that is real, because `Enrolment.tier_id` is
unambiguous even while `programme_id` is not. The deeper fix — modelling
many-to-many programme access — is decision D-4 in
[docs/decisions.md](../../docs/decisions.md).

Same check for deactivating a programme.

### Never delete a programme with enrolments

Soft-delete only (`isActive = false`, or the enum's `archived`). A hard
delete cascades to sessions, attendance records, and enrolment links —
destroying the audit trail for members who completed it.

Same rule for sessions: deactivate, never delete, once attendance exists.

```ts
const hasAttendance = await db.attendanceRecord.count({
  where: { sessionId: session.id },
});
if (hasAttendance > 0) {
  throw new ConflictError(
    "Session has attendance records. Deactivate instead.",
  );
}
```

## Edge cases the agent will hit

| Case                                            | Handling                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Session end before start                        | Validate; block.                                                               |
| Zero sessions on an active programme            | Warn, allow — a programme can be defined before sessions are scheduled.        |
| Programme active with no tier mapping           | Block. An unmapped programme is invisible to everyone.                         |
| Overlapping sessions in the same programme      | Warn; allow with confirmation.                                                 |
| Session scheduled in the past                   | Allow for historical entry; warn in the UI.                                    |
| Timezone confusion on session entry             | Store UTC, render WAT. Never trust a client-supplied timezone.                 |
| Duplicate session titles                        | Allow. Not an error.                                                           |
| Deactivating a session members already attended | Allowed; attendance records survive.                                           |
| Deleting a draft programme                      | Allowed — no enrolments, no attendance.                                        |
| Editing a programme created by another admin    | Allowed. Super Admin owns configuration; any admin can edit programme content. |
| Setting attendance threshold below 60           | **Block** (BR-008 floor).                                                      |
| Setting attendance threshold to 100             | Warn — leaves no margin for legitimate absence.                                |

## What to test

- [ ] Admin can create a programme with metadata and tier mapping
- [ ] Retired tiers II, VI, VII do not appear in the tier picker
- [ ] A programme cannot be activated with no tier mapping
- [ ] Admin can create sessions with correct location-type validation
- [ ] `virtual` session without a URL is rejected
- [ ] `physical` session without an address is rejected
- [ ] Session end before start is rejected
- [ ] Attendance threshold below 60 is rejected by `lib/programmes/`
- [ ] Removing a tier with active members on it is blocked (counted by
      `tierId`, not by `programmeId`)
- [ ] Deactivating a programme with active members is blocked
- [ ] Deleting a session with attendance records is blocked
- [ ] Programme list sorts by a sensible default (title or start date)
- [ ] Sessions sort by `scheduledStart ASC`
- [ ] Member dashboard shows only programmes mapped to their tier
- [ ] Member dashboard hides sessions from deactivated programmes

## Common mistakes

1. **Conflating programme duration with mentorship duration.** Programme
   is weeks; mentorship is months and lives on the tier (§12.2).
2. **Hard-deleting programmes or sessions.** Destroys the attendance
   trail. Deactivate instead.
3. **Letting the admin remove a tier with active enrolments.** Silently
   breaks paying members' dashboards.
4. **Allowing an attendance threshold below 60.** Contradicts BR-008.
5. **Storing session times in local time.** Store UTC. Render WAT.
6. **Trusting a client-supplied timezone.** Convert on the server from a
   known input format.
7. **Building materials before the entity question is resolved.** See the
   gap note at the top.
8. **Treating O'Free tier mapping as obvious.** It is not. Ask.
9. **Making programme creation require a deploy.** PRD §22.2 forbids it.

## Done when

- [ ] Programme creation form works at 375px
- [ ] Tier picker excludes retired tiers
- [ ] Session creation validates location type and dates
- [ ] Attendance threshold floor of 60 enforced in `lib/`, not the schema
- [ ] Tier removal and programme deactivation blocked when affected members
      exist
- [ ] Session deletion blocked when attendance exists
- [ ] Programme appears in the member dashboard for mapped tiers only
- [ ] All edge cases above tested
- [ ] Materials deferred until the entity question is resolved
- [ ] `npm run verify` passes
