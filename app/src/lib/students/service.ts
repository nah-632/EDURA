/**
 * Student records (minor data, §7.1, §22).
 *
 * A student row belongs to one account and is only ever read or written through
 * the owner's id. The tutor sees the first name, stage and teaching notes - not
 * the record - and no public page reads this table at all.
 */
import { query, queryOne } from "@/lib/db";
import { writeAudit } from "@/lib/security/audit";
import { createGuardianLink, type GuardianConsentMeta } from "@/lib/guardian/service";

export interface StudentRecord {
  id: string;
  fullName: string;
  stageId: string | null;
  stageName: string | null;
  grade: string | null;
  gender: string | null;
  birthYear: number | null;
  isMinor: boolean;
  notes: string | null;
  createdAt: Date;
}

export interface StudentInput {
  fullName: string;
  stageId?: string | null;
  grade?: string | null;
  gender?: "male" | "female" | null;
  birthYear?: number | null;
  notes?: string | null;
}

export async function listStudents(ownerUserId: string): Promise<StudentRecord[]> {
  const rows = await query<{
    id: string;
    full_name: string;
    stage_id: string | null;
    stage_name: string | null;
    grade: string | null;
    gender: string | null;
    birth_year: number | null;
    is_minor: boolean;
    notes: string | null;
    created_at: Date;
  }>(
    `select s.id, s.full_name, s.stage_id, st.name_ar as stage_name, s.grade, s.gender,
            s.birth_year, s.is_minor, s.notes, s.created_at
       from students s
       left join educational_stages st on st.id = s.stage_id
      where s.owner_user_id = $1 and s.deleted_at is null
      order by s.created_at`,
    [ownerUserId],
  );
  return rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    stageId: row.stage_id,
    stageName: row.stage_name,
    grade: row.grade,
    gender: row.gender,
    birthYear: row.birth_year,
    isMinor: row.is_minor,
    notes: row.notes,
    createdAt: row.created_at,
  }));
}

export async function createStudent(
  ownerUserId: string,
  input: StudentInput,
  consent?: GuardianConsentMeta,
): Promise<{ id: string }> {
  const rows = await query<{ id: string }>(
    `insert into students (owner_user_id, full_name, stage_id, grade, gender, birth_year, notes)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [
      ownerUserId,
      input.fullName.trim(),
      input.stageId ?? null,
      input.grade ?? null,
      input.gender ?? null,
      input.birthYear ?? null,
      input.notes ?? null,
    ],
  );
  const id = rows[0]!.id;
  // Slice A+K: a new record is a minor by default (birth_year absent = minor,
  // per the owner decision). The declaring account becomes the guardian of a
  // PENDING self_declared link with consent captured from this request, so a
  // link ALWAYS exists from the first moment of the record's life.
  await createGuardianLink({
    guardianUserId: ownerUserId,
    studentId: id,
    relationshipType: "other",
    consent: consent ?? { ip: null, userAgent: null },
  });
  await writeAudit({
    actorUserId: ownerUserId,
    actorLabel: null,
    action: "student.created",
    // The audit row records the action, not the child's details.
    entity: "students",
    entityId: id,
    after: { has_stage: Boolean(input.stageId), is_minor: input.birthYear == null },
  });
  return { id };
}

export async function updateStudent(
  ownerUserId: string,
  studentId: string,
  input: StudentInput,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `update students
        set full_name = $3, stage_id = $4, grade = $5, gender = $6, birth_year = $7, notes = $8
      where id = $1 and owner_user_id = $2 and deleted_at is null
      returning id`,
    [
      studentId,
      ownerUserId,
      input.fullName.trim(),
      input.stageId ?? null,
      input.grade ?? null,
      input.gender ?? null,
      input.birthYear ?? null,
      input.notes ?? null,
    ],
  );
  if (!rows[0]) return false;
  await writeAudit({
    actorUserId: ownerUserId,
    actorLabel: null,
    action: "student.updated",
    entity: "students",
    entityId: studentId,
  });
  return true;
}

/**
 * Soft delete. Historic bookings keep pointing at the row (they are financial
 * records), but the child's details are cleared so the data is genuinely gone
 * rather than merely hidden (§25).
 */
export async function deleteStudent(ownerUserId: string, studentId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `update students
        set deleted_at = now(), full_name = 'طالب محذوف', notes = null, grade = null,
            birth_year = null, gender = null
      where id = $1 and owner_user_id = $2 and deleted_at is null
      returning id`,
    [studentId, ownerUserId],
  );
  if (!rows[0]) return false;
  // Slice A+K: the record is gone — its active guardian links must not stay
  // verified. Rows are revoked (kept, like the student row, for the audit
  // story), never deleted.
  await query(
    `update guardian_links
        set verification_status = 'revoked', revoked_at = now(), updated_at = now(),
            revoke_reason = 'student_record_deleted'
      where student_id = $1 and verification_status in ('pending', 'verified')`,
    [studentId],
  );
  await writeAudit({
    actorUserId: ownerUserId,
    actorLabel: null,
    action: "student.deleted",
    entity: "students",
    entityId: studentId,
  });
  return true;
}

/** Ownership probe used by the booking route before it trusts an id. */
export async function ownsStudent(ownerUserId: string, studentId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from students where id = $1 and owner_user_id = $2 and deleted_at is null`,
    [studentId, ownerUserId],
  );
  return Boolean(row);
}
