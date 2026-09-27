## Part 1 — What to Remove (and Why)

**Nothing should be removed from the refined prompt.**

The refined prompt is lean. Every section earns its place:

| Section                        | Why it stays                   |
| ------------------------------ | ------------------------------ |
| ROLE (3 personas)              | Already trimmed from 11        |
| MISSION                        | Clear, single-purpose          |
| CONTEXT (20 sub-sections)      | All facts confirmed by client  |
| OUTPUT STRUCTURE (22 sections) | Appropriate for a Phase 1 spec |
| REQUIREMENT CLASSIFICATION     | Essential for honesty          |
| GUARDRAILS                     | Protects scope and quality     |
| TONE                           | Brief and correct              |
| FALLBACK BEHAVIOUR             | Excellent as-is                |
| LENGTH & FORMAT                | Prevents 100-page monsters     |
| FINAL INSTRUCTION              | Concise                        |

One minor consolidation (not removal): the **Examples section was already dropped** in the refined version — correctly so, because it duplicated the Guardrails. No further removals recommended.

---

## Part 2 — What's Missing (and Why It Matters)

### 2.1 Missing: Explicit Schema/Data Model Design Section

The refined prompt says "Define the database/domain model" (section 15 of output structure) but gives **no schema specification**. For a Nigerian platform handling healthcare professionals' data and payments, the schema must be designed with specific entities, fields, and regulatory fields from the start.

**Why this matters:** If the schema isn't specified, the AI will produce a generic entity list that misses NDPA-required fields (consent records, audit trails, data subject request tracking, breach notification records). Retrofitting these later means migration work.

### 2.2 Missing: Nigerian Data Protection Act (NDPA) 2023 Compliance Requirements

The refined prompt says "Do not claim legal compliance without verification" — which is good — but provides **no direction on what NDPA compliance actually requires**. Under the NDPA 2023 and the General Application and Implementation Directive (GAID) 2025:

- **Registration:** Entities processing personal data of **more than 200 data subjects within six months** must register with the Nigeria Data Protection Commission (NDPC) as Data Controllers/Processors of Major Importance (DCPMI).
- **DPO Appointment:** Every DCPMI must appoint a qualified Data Protection Officer, either as staff or external contractor.
- **Breach Notification:** Data controllers must notify the NDPC **within 72 hours** of becoming aware of a breach likely to pose a risk to data subjects' rights and freedoms.
- **Compliance Audit:** Annual Data Protection Compliance Audits and filing of Compliance Audit Returns (CAR) are mandatory.
- **Cross-Border Transfers:** Transfer of personal data outside Nigeria requires adequate safeguards or prior NDPC approval via a Cross-Border Data Transfer Instrument (CBDTI).
- **Consent:** Must be freely given, specific, informed, and unambiguous. Silence or pre-selected options do **not** constitute consent.
- **Data Subject Rights:** Right to be informed, access, rectification, erasure, restriction, portability, and objection must be supported.

**Why this matters:** EHEMS handles **healthcare professionals' data** — and under NDPA, health data is classified as **sensitive personal data** requiring explicit consent and heightened protections. The platform also processes payment proofs, which contain financial information. Without explicit schema fields for consent, audit, breach tracking, and data subject rights, the platform cannot demonstrate compliance.

### 2.3 Missing: Sensitive Data Handling Protocol

The prompt doesn't address how to handle **sensitive personal data** (health data, payment proof, government IDs). Under NDPA, sensitive data requires:

- Explicit consent
- Enhanced security measures (encryption, anonymisation)
- Stricter access controls

**Why this matters:** The platform may collect healthcare professional credentials, payment receipts, and potentially patient-adjacent information. The schema and access controls must flag sensitive fields and restrict access.

### 2.4 Missing: Consent Management System

NDPA requires demonstrable consent. The prompt doesn't specify:

- Consent records (who, when, what version, what they agreed to)
- Consent withdrawal mechanism
- Consent for different processing purposes (marketing, data processing, sensitive data)

**Why this matters:** Without consent records, the platform cannot lawfully process personal data. A consent management entity must exist in the schema from Phase 1.

### 2.5 Missing: Audit Logging Requirements

NDPA's accountability principle requires records of processing activities. The prompt mentions "audit logs" in the security guardrail but doesn't specify what must be logged or how.

**Why this matters:** Audit logs are required to demonstrate compliance. The schema needs a dedicated audit entity tracking who accessed what, when, and what changed — especially for admin actions (payment verification, member completion, certificate issuance).

### 2.6 Missing: Data Subject Rights Implementation

NDPA grants data subjects the right to access, rectify, erase, restrict, and port their data. The prompt doesn't specify how these requests are received, tracked, or fulfilled.

**Why this matters:** Members will request their data, ask for corrections, or request deletion. Without a tracked workflow, you cannot demonstrate compliance.

### 2.7 Missing: Data Retention & Deletion Policy

NDPA's storage limitation principle requires data to be kept only as long as necessary. The prompt doesn't specify retention periods or deletion workflows.

**Why this matters:** Payment proofs, attendance records, and personal data cannot be kept indefinitely. The schema needs retention fields and a deletion policy.

### 2.8 Missing: Nigerian Payment Context

The prompt says "manual payment" but doesn't address **Nigerian payment realities**: bank transfer confirmation, mobile money references, cash collection, and the need to store payment references in Nigerian formats (NIBSS, bank codes, etc.).

**Why this matters:** Manual payment verification in Nigeria requires specific fields — payment reference, bank name, transfer date, proof upload — that a generic "payment" entity won't capture.

### 2.9 Missing: Multi-Currency Consideration (Minimal)

All prices are in Naira (₦). If EHEMS eventually accepts international payments (e.g., for Higher Advanced VIII's "international opportunities"), the schema must support currency codes. The prompt doesn't mention this.

**Why this matters:** Adding currency later means migrating payment records. A simple `currency` field costs nothing now.

### 2.10 Missing: Content Management Workflow Detail

The prompt says "lightweight admin CMS" but doesn't specify what content types need management, how programmes are added, or how content versioning works.

**Why this matters:** The client will supply new programmes. The CMS must support adding programmes, sessions, materials, and certificates without developer involvement.

---

## Part 3 — Schema Design (Aligned with Nigerian Standards)

The following schema specification should be **inserted into the refined prompt** under the OUTPUT STRUCTURE, replacing or expanding section 15 (Database / Domain Model). It is deliberately **tech-agnostic** — no database engine, no ORM, no frontend/backend stack.

### Schema Specification: EHEMS Domain Model

#### Core Entities

| Entity                 | Purpose                               | Key Fields                                                                                                                                                                                                                                                               | Nigerian Compliance Notes                                                                                                                |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **User**               | Any person with an account            | `id`, `email`, `phone` (Nigerian format), `password_hash`, `full_name`, `profession`, `healthcare_specialty`, `is_active`, `email_verified_at`, `phone_verified_at`, `created_at`, `updated_at`, `deleted_at` (soft delete for erasure requests), `data_retention_until` | Phone must validate Nigerian numbers. Soft delete required for NDPA erasure requests without losing referential integrity.               |
| **Role**               | Permission grouping                   | `id`, `name`, `description`, `is_system`                                                                                                                                                                                                                                 | Roles: Super Admin, Admin, Mentor, Member, Visitor.                                                                                      |
| **Permission**         | Granular access control               | `id`, `name`, `resource`, `action`                                                                                                                                                                                                                                       | RBAC supports multiple roles per user.                                                                                                   |
| **UserRole**           | Many-to-many user↔role                | `user_id`, `role_id`, `assigned_at`, `assigned_by`                                                                                                                                                                                                                       | A user can hold multiple roles (mentee + mentor).                                                                                        |
| **ConsentRecord**      | NDPA-required demonstrable consent    | `id`, `user_id`, `consent_type` (data_processing, marketing, sensitive_data, cross_border_transfer), `consent_version`, `consent_text`, `given_at`, `withdrawn_at`, `ip_address`, `user_agent`                                                                           | Required by NDPA Section 14. Silence or pre-selected options are NOT consent. Must track withdrawal.                                     |
| **DataSubjectRequest** | NDPA rights fulfilment tracking       | `id`, `user_id`, `request_type` (access, rectification, erasure, restriction, portability, objection), `status` (pending, in_progress, completed, rejected), `requested_at`, `completed_at`, `handled_by`, `response_notes`                                              | NDPA grants these rights. Must be trackable and auditable.                                                                               |
| **BreachIncident**     | NDPA 72-hour notification tracking    | `id`, `detected_at`, `description`, `affected_count`, `risk_level` (low, medium, high), `ndpc_notified_at` (must be ≤72h from detection), `data_subjects_notified_at`, `remediation_actions`, `status`                                                                   | NDPA Section 40 requires 72-hour notification to NDPC if breach poses risk.                                                              |
| **AuditLog**           | Accountability and processing records | `id`, `user_id` (actor), `action`, `entity_type`, `entity_id`, `old_values`, `new_values`, `ip_address`, `user_agent`, `created_at`                                                                                                                                      | NDPA accountability principle. Required for admin actions: payment verification, completion marking, certificate issuance, role changes. |

#### Membership & Enrolment Entities

| Entity              | Purpose                                    | Key Fields                                                                                                                                                                                                                                                                           | Notes                                                                                                             |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Tier**            | Purchasable tier definition                | `id`, `name`, `display_order`, `price_ngn`, `currency` (default NGN), `mentorship_duration_months`, `positioning_text`, `is_free`, `is_active`, `created_at`                                                                                                                         | Active tiers: O'Free, Basic, Basic III, Advanced IV, Advanced V, Higher Advanced VIII. II, VI, VII internal only. |
| **TierBenefit**     | Benefits per tier                          | `id`, `tier_id`, `benefit_text`, `category` (certificate, mentorship, community, resource, opportunity), `display_order`                                                                                                                                                             | Used for tier comparison and dashboard display.                                                                   |
| **TierCertificate** | Certificate catalogue mapped to tiers      | `tier_id`, `certificate_id`                                                                                                                                                                                                                                                          | 30+ certificates across tiers. Deduplicate identical names.                                                       |
| **Enrolment**       | User's active/past programme participation | `id`, `user_id`, `tier_id`, `programme_id`, `status` (pending_payment, active, completed, expired, cancelled), `enrolled_at`, `completed_at`, `completion_marked_by`, `attendance_percentage`, `assignment_checklist_completed`, `certificate_eligible`, `upgrade_from_enrolment_id` | Supports multiple enrolments per user. Tracks upgrade path.                                                       |
| **Programme**       | A learning/mentorship programme            | `id`, `title`, `description`, `duration_weeks`, `attendance_threshold` (default 60), `is_active`, `created_by`, `created_at`                                                                                                                                                         | Programmes can span multiple tiers.                                                                               |
| **ProgrammeTier**   | Many-to-many programme↔tier access         | `programme_id`, `tier_id`                                                                                                                                                                                                                                                            | Controls which tiers unlock which programmes.                                                                     |
| **Session**         | A dated session within a programme         | `id`, `programme_id`, `title`, `scheduled_start`, `scheduled_end`, `location_type` (physical, virtual, hybrid), `location_details`, `is_active`                                                                                                                                      | Used for attendance tracking.                                                                                     |

#### Attendance & Completion Entities

| Entity                   | Purpose                                  | Key Fields                                                                                                                                                        | Notes                                                       |
| ------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **AttendanceRecord**     | Per-member per-session attendance        | `id`, `user_id`, `session_id`, `enrolment_id`, `status` (present, absent, late, excused), `method` (qr, manual, fallback_code), `marked_by`, `marked_at`, `notes` | Phase 1: manual admin marking. Phase 2: QR attendance.      |
| **AssignmentChecklist**  | Admin checklist per member per enrolment | `id`, `enrolment_id`, `requirement_name`, `is_completed`, `completed_at`, `marked_by`, `notes`                                                                    | Phase 1: admin records completion manually.                 |
| **CertificateCatalogue** | Master list of all certificates          | `id`, `name`, `description`, `template_url`, `issuing_body`, `is_active`                                                                                          | 30+ certificates. Deduplicate duplicates.                   |
| **MemberCertificate**    | Issued certificates                      | `id`, `user_id`, `certificate_id`, `enrolment_id`, `issued_at`, `issued_by`, `verification_id` (unique), `status` (issued, revoked)                               | Issued only after admin marks Completed.                    |
| **Feedback**             | Mentee/mentor feedback                   | `id`, `user_id`, `enrolment_id`, `session_id`, `feedback_type` (session, programme, mentor, platform), `rating`, `comment`, `is_anonymous`, `created_at`          | Feeds into performance indicators and mentor qualification. |

#### Commerce & Payment Entities

| Entity                 | Purpose                           | Key Fields                                                                                                                                                                                                                                                                                                                       | Notes                                                               |
| ---------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Product**            | Physical or digital products      | `id`, `name`, `description`, `product_type` (physical, digital), `price_ngn`, `currency`, `is_active`, `entitlement_granted` (community link, notification access, etc.)                                                                                                                                                         | Physical: books, CDs. Digital: downloads, resources.                |
| **ProductEntitlement** | Product-specific access grants    | `product_id`, `entitlement_type`, `entitlement_value`                                                                                                                                                                                                                                                                            | Some books unlock private communities or lifetime notifications.    |
| **Order**              | Physical/digital product orders   | `id`, `user_id`, `product_id`, `quantity`, `total_amount`, `currency`, `fulfilment_type` (delivery, collection), `delivery_address_encrypted`, `status` (requested, paid, dispatched, ready_for_collection, collected), `created_at`                                                                                             | Phase 1: manual fulfilment.                                         |
| **Payment**            | Manual payment record             | `id`, `user_id`, `enrolment_id`, `order_id`, `amount`, `currency` (NGN), `payment_method` (bank_transfer, mobile_money, cash), `payment_reference`, `bank_name`, `transfer_date`, `proof_url`, `status` (pending, submitted, under_review, verified, rejected), `submitted_at`, `verified_at`, `verified_by`, `rejection_reason` | Naira amounts. Payment and enrolment are architecturally separated. |
| **Voucher**            | Discount vouchers                 | `id`, `code`, `discount_type` (percentage, fixed), `discount_value`, `applicable_tier_id`, `expires_at`, `max_uses`, `used_count`, `is_active`                                                                                                                                                                                   | Applied manually by admin in Phase 1.                               |
| **UpgradeCalculation** | Records upgrade pricing decisions | `id`, `user_id`, `from_enrolment_id`, `to_tier_id`, `list_price_difference`, `amount_due`, `discount_applied`, `calculated_at`, `approved_by`                                                                                                                                                                                    | Tracks the difference-pricing rule (list price basis).              |

#### Events & Community Entities

| Entity                    | Purpose                         | Key Fields                                                                                                                                                                                                                                                                                                         | Notes                                                                            |
| ------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Event**                 | Workshops, conferences, shows   | `id`, `title`, `description`, `event_type` (workshop, conference, networking, show, outdoor, indoor), `start_datetime`, `end_datetime`, `location_type` (physical, virtual, hybrid), `location_details`, `payment_model` (one_time, yearly_ticket), `ticket_price`, `yearly_ticket_price`, `capacity`, `is_active` | Yearly tickets only for designated events.                                       |
| **EventRegistration**     | Member event registration       | `id`, `user_id`, `event_id`, `registration_type` (attendee, applicant, viewer), `payment_status`, `attendance_status`, `registered_at`                                                                                                                                                                             |                                                                                  |
| **CommunityLink**         | External community access links | `id`, `tier_id`, `programme_id`, `access_level` (general, ehems_open_sales), `platform` (whatsapp, telegram), `link_url`, `label`, `is_active`                                                                                                                                                                     | EHEMS OPEN sales/marketing benefits from Advanced IV. General community for all. |
| **Internship**            | Internship opportunities        | `id`, `title`, `description`, `host_organisation`, `is_paid`, `duration_weeks`, `location_type`, `eligibility_criteria`, `is_active`                                                                                                                                                                               | Phase 2 scope.                                                                   |
| **InternshipApplication** | Member applications             | `id`, `user_id`, `internship_id`, `status` (applied, shortlisted, selected, rejected, completed), `applied_at`, `completed_at`, `feedback`                                                                                                                                                                         | Phase 2 scope.                                                                   |

#### Notification & System Entities

| Entity              | Purpose                        | Key Fields                                                                                                                                                                                                                                  | Notes                                      |
| ------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Notification**    | Outbound notifications         | `id`, `user_id`, `notification_type` (registration, payment, enrolment, reminder, certificate, announcement), `channel` (email, sms, whatsapp, telegram, in_app), `subject`, `body`, `status` (pending, sent, failed), `sent_at`, `read_at` | Extensible across providers.               |
| **RetentionPolicy** | Data retention rules           | `id`, `data_category`, `retention_months`, `deletion_action` (anonymise, delete, archive), `is_active`                                                                                                                                      | NDPA storage limitation principle.         |
| **SystemSetting**   | Configurable platform settings | `id`, `key`, `value`, `description`, `updated_by`, `updated_at`                                                                                                                                                                             | Attendance threshold, discount rules, etc. |

#### Key Relationships

```
User ──< ConsentRecord
User ──< DataSubjectRequest
User ──< AuditLog (as actor)
User ──< Enrolment >── Tier
Enrolment ──< AttendanceRecord >── Session >── Programme
Enrolment ──< AssignmentChecklist
Enrolment ──< MemberCertificate >── CertificateCatalogue
Enrolment ──< Feedback
User ──< Payment >── Enrolment
User ──< Order >── Product >── ProductEntitlement
Tier ──< TierBenefit
Tier ──< TierCertificate >── CertificateCatalogue
Tier ──< CommunityLink
Programme ──< ProgrammeTier >── Tier
Event ──< EventRegistration >── User
```

#### Nigerian Compliance Fields (Summary)

| Requirement                         | Schema Implementation                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Consent (NDPA s.14)**             | `ConsentRecord` entity with version, text, timestamp, withdrawal tracking                                   |
| **Data Subject Rights (NDPA)**      | `DataSubjectRequest` entity with request type, status, handling                                             |
| **Breach Notification (NDPA s.40)** | `BreachIncident` entity with 72-hour notification tracking                                                  |
| **DPO Appointment**                 | `User` role `DPO` or external flag; `AuditLog` for DPO actions                                              |
| **Audit Trail**                     | `AuditLog` entity for all admin actions                                                                     |
| **Data Retention**                  | `data_retention_until` on User; `RetentionPolicy` entity                                                    |
| **Sensitive Data**                  | `is_sensitive` flag on applicable fields; encryption required for `proof_url`, `delivery_address_encrypted` |
| **Cross-Border Transfer**           | `ConsentRecord.consent_type = cross_border_transfer`; `SystemSetting` for approved transfer mechanisms      |
| **Nigerian Phone Format**           | Validation on `User.phone` (e.g., +234 format)                                                              |
| **Naira Currency**                  | Default `currency = 'NGN'` on all monetary entities                                                         |

---

## Part 4 — Additional Missing Sections for the Prompt

The following should be **added to the refined prompt** as new guardrails or output sections.

### 4.1 Add: Data Protection & Compliance Section (Output Section 18.5)

**Why:** The prompt has a Security & Privacy section but no dedicated compliance section. NDPA compliance is not optional for a Nigerian platform handling healthcare professionals' data.

**Add to output structure:**

> **18.5 Data Protection & NDPA Compliance** Define how the platform complies with the Nigeria Data Protection Act 2023 and GAID 2025. Cover:
>
> - Lawful basis for processing each data category
> - Consent management (collection, storage, withdrawal)
> - Data subject rights implementation (access, rectification, erasure, restriction, portability, objection)
> - Breach detection and 72-hour NDPC notification workflow
> - Data Protection Officer (DPO) responsibilities within the platform
> - Cross-border data transfer safeguards
> - Data retention and deletion policies
> - Sensitive personal data handling (health data, payment proof)
> - Registration obligations (if >200 data subjects in 6 months)
> - Annual audit preparation and Compliance Audit Return (CAR) support

### 4.2 Add: Schema Design Section (Replace Output Section 15)

**Why:** The existing "Database / Domain Model" section is too vague. Replace with explicit entity specification as designed above.

**Replace section 15 with:**

> **15. Database / Domain Model** Produce a complete entity specification including:
>
> - Entity name, purpose, key fields, relationships
> - Nigerian compliance fields (consent, audit, breach, retention)
> - Sensitive data flags and encryption requirements
> - Enum values for all status fields
> - Index recommendations for performance-critical queries
> - Retention periods per entity
> - Soft delete vs hard delete policy per entity
> - Audit log coverage for admin actions

### 4.3 Add: Payment Context Guardrail

**Why:** Manual payment in Nigeria has specific realities (bank transfer confirmation, mobile money references, cash collection) that a generic payment model won't capture.

**Add to Section 6 (Guardrails) under Payment:**

> **Nigerian Payment Context**
>
> - All monetary amounts default to NGN (Naira).
> - Manual payment fields must capture: bank name, transfer date, payment reference, proof upload (receipt/screenshot).
> - Payment proof is sensitive data — must be encrypted at rest and access-restricted.
> - Mobile money references (e.g., OPay, PalmPay, Moniepoint) must be supported as payment method.
> - Currency field must exist on all monetary entities, even if Phase 1 is NGN-only.

### 4.4 Add: Content Management Guardrail

**Why:** The prompt says "lightweight admin CMS" but doesn't specify what needs managing. The client will supply new programmes; the CMS must support this.

**Add to Section 6 under Content:**

> **Content Management Requirements** The admin CMS must support:
>
> - Adding/editing programmes (title, description, duration, tier access, attendance threshold)
> - Adding/editing sessions within programmes (date, time, location, materials)
> - Uploading learning materials (PDFs, videos, audio, links) with tier/programme access control
> - Adding new certificates to the catalogue
> - Managing community links per tier/programme
> - No code changes required for content updates
> - Content versioning (basic: created_at, updated_at, updated_by)

### 4.5 Add: Data Subject Rights Workflow (Output Section 18.6)

**Why:** NDPA grants data subjects specific rights. The platform must support these requests.

**Add to output structure:**

> **18.6 Data Subject Rights Workflow** Define how the platform handles:
>
> - Access requests (member requests copy of their data)
> - Rectification requests (member requests correction)
> - Erasure requests (member requests deletion — subject to legal retention requirements)
> - Restriction requests (member restricts processing)
> - Portability requests (member requests data export)
> - Objection requests (member objects to processing)
>
> Include: request submission form, tracking status, admin workflow, response templates, retention of request records.

### 4.6 Add: Breach Response Workflow (Output Section 18.7)

**Why:** NDPA requires breach notification within 72 hours. The platform needs a workflow, not just a field.

**Add to output structure:**

> **18.7 Breach Response Workflow** Define:
>
> - How breaches are detected and logged
> - Assessment criteria for "risk to data subjects"
> - 72-hour NDPC notification trigger and template
> - Data subject notification requirements
> - Remediation tracking
> - Post-incident review process
> - Audit trail for all breach-related actions

### 4.7 Add: Non-Functional Requirements for Compliance (Section 20)

**Why:** Compliance imposes non-functional requirements (encryption, access logging, backup) that must be specified.

**Add to Section 20 (Non-Functional Requirements):**

> **Compliance-Driven Non-Functional Requirements**
>
> - All sensitive data encrypted at rest (AES-256) and in transit (TLS 1.2+)
> - Audit logs immutable and retained per NDPA requirements
> - Consent records retained for duration of processing + 6 years
> - Data subject request records retained for 6 years
> - Breach incident records retained for 6 years
> - Automated backup with point-in-time recovery
> - Role-based access with principle of least privilege
> - Admin actions require re-authentication for sensitive operations
> - Session timeout after inactivity
> - Rate limiting on authentication endpoints

### 4.8 Add: Registration & Compliance Checklist (Appendix F)

**Why:** The platform may trigger NDPC registration obligations. The prompt should identify this.

**Add to Appendices:**

> **Appendix F — NDPC Registration & Compliance Checklist**
>
> - Determine if EHEMS qualifies as a Data Controller/Processor of Major Importance (DCPMI) — threshold: >200 data subjects in 6 months.
> - If DCPMI: register with NDPC within 6 months of commencing processing.
> - Appoint a qualified Data Protection Officer (DPO).
> - Conduct annual Data Protection Compliance Audit.
> - File Compliance Audit Return (CAR) annually.
> - Maintain records of processing activities.
> - Implement cross-border transfer safeguards if data leaves Nigeria.
> - Conduct Data Protection Impact Assessment (DPIA) for high-risk processing.
>
> Note: This checklist is for planning purposes. EHEMS should obtain legal advice to confirm specific obligations.

---

## Part 5 — Summary of Audit Findings

| Finding                               | Action                                                                         | Why                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Nothing needs removal                 | Keep refined prompt intact                                                     | Every section earns its place                                         |
| No explicit schema design             | Add detailed schema specification (Part 3)                                     | Prevents generic entity list; ensures Nigerian compliance fields      |
| NDPA compliance not specified         | Add compliance section, DPO requirements, breach workflow, data subject rights | Legal requirement for Nigerian platform; healthcare data is sensitive |
| Consent management missing            | Add `ConsentRecord` entity and workflow                                        | NDPA requires demonstrable consent                                    |
| Audit logging vague                   | Add `AuditLog` entity with specific coverage                                   | Accountability principle; required for admin action transparency      |
| Data subject rights not tracked       | Add `DataSubjectRequest` entity and workflow                                   | NDPA grants these rights; must be trackable                           |
| Breach notification not designed      | Add `BreachIncident` entity and 72-hour workflow                               | NDPA Section 40 requirement                                           |
| Data retention not specified          | Add retention fields and policy entity                                         | Storage limitation principle                                          |
| Sensitive data handling not addressed | Add encryption fields and access controls                                      | Health data and payment proof are sensitive under NDPA                |
| Nigerian payment context missing      | Add payment fields (bank, transfer date, reference, mobile money)              | Manual payment in Nigeria requires specific data capture              |
| Currency not specified                | Add `currency` field (default NGN)                                             | Future-proofing; Naira formatting                                     |
| Content management vague              | Add CMS requirements specification                                             | Client will supply new programmes; no-code updates required           |
| Registration threshold not mentioned  | Add NDPC registration checklist                                                | >200 data subjects in 6 months triggers DCPMI status                  |

---

## Part 6 — Updated Prompt Additions (Ready to Paste)

The following should be **inserted into the refined prompt** at the indicated locations.

### Insert after Section 3.20 (Commercial context):

```
3.21 Nigerian Regulatory Context
EHEMS operates in Nigeria and processes personal data of Nigerian residents,
including healthcare professionals. The platform must be designed to support
compliance with:

- Nigeria Data Protection Act 2023 (NDPA)
- General Application and Implementation Directive 2025 (GAID)
- National Health Act 2014 (Section 26 — patient confidentiality)
- Central Bank of Nigeria payment system guidelines (for future gateway)

Key requirements to design for (not claim as certified):
- Consent must be freely given, specific, informed, unambiguous, and withdrawable
- Data subject rights: access, rectification, erasure, restriction, portability, objection
- Breach notification to NDPC within 72 hours of detection
- DPO appointment required if registered as Data Controller/Processor of Major Importance
- Registration with NDPC required if processing >200 data subjects in 6 months
- Cross-border data transfers require adequate safeguards or NDPC approval
- Health data is classified as sensitive personal data requiring explicit consent
- Annual compliance audit and Compliance Audit Return (CAR) filing

Do not claim compliance. Design for compliance. Flag legal verification as needed.
```

### Insert into Section 6 (Guardrails) under Security:

```
Nigerian Data Protection & Sensitive Data
- All personal data processing must have a lawful basis documented in the schema.
- Consent records must capture version, text, timestamp, and withdrawal.
- Health-related data must be flagged as sensitive and encrypted.
- Payment proof (receipts, transfer confirmations) must be encrypted at rest.
- Audit logs must capture all admin actions on personal data.
- Data subject requests must be tracked from submission to resolution.
- Breach incidents must be logged with 72-hour notification tracking.
- Data retention periods must be defined per entity and enforced.
- Cross-border transfers must be flagged in the schema.
```

### Insert after Output Section 18 (Security, Privacy & Access Control):

```
18.5 Data Protection & NDPA Compliance
18.6 Data Subject Rights Workflow
18.7 Breach Response Workflow
18.8 Nigerian Payment Context
```

### Insert as Appendix F:

```
Appendix F — NDPC Registration & Compliance Checklist
Appendix G — Nigerian Payment Field Specification
```

### Replace Output Section 15 with the full schema specification from Part 3 above.

---

## Final Note

The refined prompt was already strong. This audit adds **regulatory depth** and **schema precision** that a Nigerian healthcare-adjacent platform requires. The additions are not optional niceties — they are the difference between a platform that can operate lawfully and one that cannot.

One recommendation: after generating the spec, have a Nigerian lawyer or data protection consultant review the compliance sections. The schema and workflow designs are a starting point, not legal advice.
