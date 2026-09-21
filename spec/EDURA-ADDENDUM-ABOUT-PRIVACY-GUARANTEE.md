# EDURA — ABOUT / PRIVACY / GUARANTEE ADDENDUM (paste alongside the master prompt)

هذا برومبت مستقل يُضاف إلى برومبت Edura الرئيسي وإضافة التصميم. يغطي ثلاثة أشياء لم تكن مفصّلة بما يكفي: صفحة "من نحن" بموقع وطني واضح، سياسة الخصوصية، وسياسة الضمان.

---

## ADDENDUM PROMPT — apply on top of the master prompt (§27 Homepage, §44 Legal Pages)

### A. "About Us" (من نحن) — dual-sided national positioning

Add a dedicated About page (linked from the footer and homepage) plus a short homepage teaser section. The core narrative Edura must communicate, in both languages, is that the platform serves **two sides of Bahraini society at once**:

1. **العملاء (أولياء الأمور والطلبة)** — Bahraini families who need reliable, qualified private tutoring for their children, from primary through secondary school, with full trust in who is teaching them.
2. **الكفاءات البحرينية التعليمية** — Bahraini graduates of teacher-training/education colleges and other qualified specialists in education who are looking for real income opportunities through teaching, whether as their main work or a supplementary source of income.

The tone must be genuine and specific — not generic "we connect people" copy. It should read as a platform built *for* the local community, both as service-seekers and as a livelihood channel for qualified Bahrainis, without overclaiming (no unverifiable stats like "thousands of families" unless real numbers exist — see the master prompt's §51 rule against fabricated statistics).

Suggested structure for the About page (admin-editable via CMS per §15):

- **Opening statement** (bilingual), e.g.:
  - AR: "إدورا منصة بحرينية بُنيت لخدمة طرفين من مجتمعنا: عائلات تبحث عن معلم خاص تثق به لأبنائها، وكفاءات بحرينية متخصصة في التعليم تبحث عن فرصة دخل حقيقية من خبرتها."
  - EN: "Edura is a Bahraini platform built to serve two sides of our community: families looking for a private tutor they can trust, and qualified Bahraini education specialists looking for a real income opportunity from their expertise."
- **"For Families" block** — what the platform guarantees them (vetting, verified qualifications, transparent pricing, safety).
- **"For Tutors" block** — how the platform supports Bahraini teaching talent (flexible income, visibility, verification badge as a credibility signal, fair subscription-based access rather than heavy commission-per-lesson in v1).
- **Local-identity closing line**, tying back to the hero's "Proudly Bahraini" badge from the design addendum, so the same message is reinforced on the homepage hero and reaffirmed here with substance, not just a tagline.

This is content/copy direction, not a new data entity — implement it as CMS-managed page content (§15 CMS), fully bilingual (§6), consistent with the About/Contact legal-pages list already required in §44.

### B. Privacy Policy (سياسة الخصوصية)

Add a real, structured Privacy Policy page (not boilerplate lorem ipsum, per §51/§45's no-fake-content rule), covering at minimum:

1. **What is collected**, split explicitly by role: parent/student account data, **student data where the account belongs to a minor** (name, grade, age if provided — flag this as a distinct sensitive category per the master prompt's §7.1 minor-data rule), tutor personal and qualification data, tutor identity/verification documents, payment-related records (amounts, references, verification metadata — never full card/bank details since v1 payment is manual BenefitPay handled outside the platform).
2. **How it's used** — matching a booking to a tutor, verifying tutor qualifications, processing manual payment verification, sending notifications, improving the service. No use for purposes not disclosed here.
3. **Who it's shared with** — explicitly state that booking details are shared with the platform's own WhatsApp number for payment handoff (§35), and that tutor verification documents are only accessible to authorized admins (§21, signed URLs). No sale of personal data to third parties.
4. **Data retention & deletion** — link directly to the retention/erasure rules already defined in the master prompt's §25: how long records are kept, and the account-deletion path, explicitly stating what must be retained for financial/audit reasons versus what is deleted.
5. **Minors' data** — a distinct short subsection stating that student data tied to a minor is handled with additional care, is never exposed on public tutor-facing views, and is the parent/guardian's responsibility to provide accurately; state that the platform does not knowingly collect data directly from minors themselves (the parent account is the data controller-facing party).
6. **User rights** — access, correction, and deletion requests, and how to submit them (support email from §41 settings).
7. **Cookies/tracking** — a plain, honest statement of what's actually used (analytics, session cookies) — no invented tracking claims.
8. **Legal basis placeholder** — since this must align with Bahrain's Personal Data Protection Law (PDPL, Law No. 30 of 2018), include a clearly marked placeholder noting that final legal wording requires review by a Bahrain-licensed legal advisor before publishing — do not invent specific legal citations or compliance claims (per §44's "no invented legal claims" rule).

Implement as an admin-editable CMS page (§15/§44), bilingual, linked from the footer and from every data-collection form (registration, tutor onboarding, booking).

### C. Guarantee Policy (سياسة الضمان) — new legal/trust page, add to §44's list

This is an addition to the legal pages list in the master prompt's §44. Add a "Guarantee Policy" page and a matching short trust-badge on the homepage (near the "Why choose Edura" section, §27) and on tutor profile pages (§8).

Define the guarantee structurally, without inventing unverifiable promises — the AI tool should implement it as **admin-configurable rules** (mirroring §41's settings pattern), for example:

- **Verification guarantee**: every publicly visible tutor has passed Edura's manual verification process (qualification check, document review) before being listed — this is a real, enforceable claim since it's literally how §7.2's approval flow already works.
- **Satisfaction/replacement guarantee** (admin-configurable): define what happens if a family is not satisfied with a session — e.g. eligibility for a replacement tutor or session credit, under conditions the admin sets (time window, number of completed sessions, etc.). Store this as configurable rules in Settings (§41), not hard-coded copy, since the exact commercial terms are a business decision, not a design decision.
- **Payment-safety guarantee**: bookings are only confirmed after admin-verified payment (§13), so no family pays without an admin-confirmed booking record — state this plainly as it's already true of the existing state machine.
- **What is explicitly NOT covered** — be honest about limits (e.g. no guarantee of exam outcomes/grades) to avoid overclaiming; this protects the platform legally and keeps trust real rather than inflated.

Like the Privacy Policy, mark commercial specifics (refund windows, number of free replacement sessions, etc.) as **admin-configurable settings with sensible defaults**, and mark any binding legal wording as requiring review by a Bahrain-licensed legal advisor before publishing — consistent with §44's placeholder rule.

### D. Cross-links (do this last, so the pages reinforce each other)

- Footer: add both new/expanded pages (About, Privacy Policy, Guarantee Policy) alongside the existing Terms/Cancellation/Refund/Child-safety pages from §44.
- Homepage: the About teaser section (per A) and a small guarantee trust-badge (per C) both reinforce the "Proudly Bahraini" hero badge already defined in the design addendum — the national/dual-community narrative should feel consistent from the hero through About through the trust badges, not like three disconnected pieces of copy.
