import { describe, expect, it } from "vitest";
import {
  evaluateLockoutState,
  hashPassword,
  isResetTokenExpired,
  nextFailureState,
  RESET_TOKEN_TTL_MS,
  verifyPassword,
} from "@/lib/auth-helpers";
import { canInspectRoom, canUseMessaging, roleDashboardPath } from "@/lib/rbac-policies";
import { MAX_UPLOAD_BYTES, resolveSafeStoragePath, validateUploadFile } from "@/lib/storage-rules";
import { calculateSessionHours, computeHoursProgress, evaluateScheduleWindow } from "@/lib/hours";
import { formatSafeDate, formatSafeDateTime, normalizeTaskAttachments } from "@/lib/task-format";
import { normalizePagination, registerSchema } from "@/lib/validation";

describe("Core Authentication & Lockout (03S)", () => {
  it("hashes and verifies passwords with bcrypt", async () => {
    const hash = await hashPassword("TechTrack@2026");
    expect(hash).not.toBe("TechTrack@2026");
    expect(await verifyPassword("TechTrack@2026", hash)).toBe(true);
    expect(await verifyPassword("WrongPassword", hash)).toBe(false);
  });

  it("locks account for 15 minutes after 5 consecutive failed logins", () => {
    const now = new Date("2026-11-15T10:00:00Z");
    const step4 = nextFailureState(3, now);
    expect(step4.triggeredLock).toBe(false);
    expect(step4.remainingAttempts).toBe(1);

    const step5 = nextFailureState(4, now);
    expect(step5.triggeredLock).toBe(true);
    expect(step5.lockedUntil).not.toBeNull();

    const lockCheck = evaluateLockoutState(step5.failedLoginCount, step5.lockedUntil, now);
    expect(lockCheck.isLocked).toBe(true);
    expect(lockCheck.remainingMinutes).toBe(15);

    const expiredLock = evaluateLockoutState(5, new Date(now.getTime() - 1), now);
    expect(expiredLock).toEqual({ isLocked: false, remainingMinutes: 0 });
  });

  it("enforces a one-hour password reset lifetime and expires at the exact boundary", () => {
    const now = new Date("2026-11-15T10:00:00Z");
    const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS);
    expect(RESET_TOKEN_TTL_MS).toBe(60 * 60 * 1000);
    expect(isResetTokenExpired(expiresAt, new Date(now.getTime() + RESET_TOKEN_TTL_MS - 1))).toBe(false);
    expect(isResetTokenExpired(expiresAt, new Date(now.getTime() + RESET_TOKEN_TTL_MS))).toBe(true);
    expect(isResetTokenExpired(new Date(now.getTime() - 1), now)).toBe(true);
  });

});

describe("RBAC & Charter Delimitations (04S, 09S, 11W)", () => {
  it("maps roles to dedicated dashboards", () => {
    expect(roleDashboardPath("SUPERADMIN")).toBe("/superadmin");
    expect(roleDashboardPath("ADMIN")).toBe("/admin");
    expect(roleDashboardPath("STUDENT")).toBe("/student");
  });

  it("blocks SuperAdmin from chat per Charter 160 & Flowchart 11W", () => {
    expect(canUseMessaging("STUDENT")).toBe(true);
    expect(canUseMessaging("ADMIN")).toBe(true);
    expect(canUseMessaging("SUPERADMIN")).toBe(false);
  });

  it("restricts student room inspection to assigned rooms only", () => {
    const room = { assignedAdminId: "admin-1", assignedStudentId: "student-1" };
    expect(canInspectRoom({ id: "student-1", role: "STUDENT" }, room)).toBe(true);
    expect(canInspectRoom({ id: "student-2", role: "STUDENT" }, room)).toBe(false);
    expect(canInspectRoom({ id: "super-1", role: "SUPERADMIN" }, room)).toBe(true);
  });
});

describe("Storage Security & 5MB Upload Limit", () => {
  it("accepts <=5MB allowed MIME types and rejects >5MB or disallowed MIME", () => {
    expect(validateUploadFile({ size: 1024, type: "image/png" }).ok).toBe(true);
    expect(validateUploadFile({ size: 1024, type: "application/pdf" }).ok).toBe(true);
    expect(validateUploadFile({ size: MAX_UPLOAD_BYTES + 1, type: "image/jpeg" }).ok).toBe(false);
    expect(validateUploadFile({ size: 1024, type: "application/x-msdownload" }).ok).toBe(false);
  });

  it("rejects path traversal in storage keys", () => {
    expect(() => resolveSafeStoragePath("../../etc/passwd")).toThrow();
    expect(resolveSafeStoragePath("attendance/test.png")).toContain(".storage/attendance/test.png");
  });
});

describe("Duty Hours Calculation & Schedule Validation (05S, 06S)", () => {
  it("distinguishes pending recorded hours from credited hours and requires 100h + tasks for completion", () => {
    expect(
      calculateSessionHours(new Date("2026-11-15T08:00:00"), new Date("2026-11-15T12:30:00"))
    ).toBe(4.5);

    const progress = computeHoursProgress({
      logs: [
        { status: "APPROVED", recordedHours: 96, creditedHours: 96 },
        { status: "PENDING", recordedHours: 4, creditedHours: 0 },
      ],
      requiredHours: 100,
      allAssignedTasksAccepted: true,
    });
    expect(progress.creditedHours).toBe(96);
    expect(progress.pendingHours).toBe(4);
    expect(progress.preOjtEligibleForCompletion).toBe(false);

    const completed = computeHoursProgress({
      logs: [{ status: "APPROVED", recordedHours: 100, creditedHours: 100 }],
      requiredHours: 100,
      allAssignedTasksAccepted: true,
    });
    expect(completed.preOjtEligibleForCompletion).toBe(true);
  });

  it("flags punches outside scheduled window + grace minutes as irregular", () => {
    const onTime = evaluateScheduleWindow({
      timeIn: new Date("2026-11-15T08:10:00"),
      scheduleStart: "08:00",
      scheduleEnd: "12:00",
      graceMinutes: 15,
    });
    expect(onTime.isIrregular).toBe(false);

    const late = evaluateScheduleWindow({
      timeIn: new Date("2026-11-15T12:30:00"),
      scheduleStart: "08:00",
      scheduleEnd: "12:00",
      graceMinutes: 15,
    });
    expect(late.isIrregular).toBe(true);
  });
});

describe("Validation & Server Pagination (Charter 56, 02S)", () => {
  it("enforces 15 / 25 / 50 pagination options", () => {
    expect(normalizePagination("2", "25")).toEqual({ page: 2, pageSize: 25, skip: 25, take: 25 });
    expect(normalizePagination("1", "999").pageSize).toBe(15);
  });

  it("validates self-registration payload without role selection", () => {
    const valid = registerSchema.safeParse({
      fullName: "Juan Student",
      email: "juan@aclc.edu.ph",
      studentIdNo: "2023-00200",
      program: "BSIT",
      section: "BSIT-4A",
      password: "Password123",
      confirmPassword: "Password123",
    });
    expect(valid.success).toBe(true);
  });
});

describe("Task Attachment Normalization & Safe Date Formatting", () => {
  it("normalizes both string keys and object attachment records without crashing", () => {
    const normalized = normalizeTaskAttachments([
      "tasks/abc.png",
      { key: "tasks/seed-cabling.png", name: "rack-b-test.png", mime: "image/png", size: 96 },
      { key: "tasks/report.pdf", name: "Summary.pdf", mime: "application/pdf" },
      { invalid: true },
      null,
    ]);
    expect(normalized).toEqual([
      { key: "tasks/abc.png", name: "abc.png", isImage: true },
      { key: "tasks/seed-cabling.png", name: "rack-b-test.png", isImage: true },
      { key: "tasks/report.pdf", name: "Summary.pdf", isImage: false },
    ]);
  });

  it("formats valid timestamps and falls back cleanly on empty or invalid dates", () => {
    expect(formatSafeDate("")).toBe("Not set");
    expect(formatSafeDate(null)).toBe("Not set");
    expect(formatSafeDate("not-a-date")).toBe("Not set");
    expect(formatSafeDate("2026-11-22T17:00:00.000Z")).not.toBe("Invalid Date");
    expect(formatSafeDateTime("")).toBe("—");
    expect(formatSafeDateTime("bad-date")).toBe("—");
    expect(formatSafeDateTime("2026-11-22T17:00:00.000Z")).not.toBe("Invalid Date");
  });
});
