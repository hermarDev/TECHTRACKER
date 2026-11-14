import { describe, expect, it } from "vitest";
import {
  evaluateLockoutState,
  hashPassword,
  nextFailureState,
  signSessionJwt,
  verifyPassword,
  verifySessionJwt,
} from "@/lib/auth";
import { canInspectRoom, canUseMessaging, roleDashboardPath } from "@/lib/rbac";
import { MAX_UPLOAD_BYTES, resolveSafeStoragePath, validateUploadFile } from "@/lib/storage";
import { calculateSessionHours, computeHoursProgress, evaluateScheduleWindow } from "@/lib/hours";
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
  });

  it("signs and verifies JWT session payloads", async () => {
    const token = await signSessionJwt({
      sub: "user-1",
      email: "student@aclc.edu.ph",
      fullName: "Test Student",
      role: "STUDENT",
      batchId: "batch-1",
    });
    const decoded = await verifySessionJwt(token);
    expect(decoded?.sub).toBe("user-1");
    expect(decoded?.role).toBe("STUDENT");
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
