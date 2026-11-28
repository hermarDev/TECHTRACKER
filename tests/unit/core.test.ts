import { describe, expect, it } from "vitest";
import { roleDashboardPath } from "@/lib/rbac-policies";
import { computeHoursProgress } from "@/lib/hours";
import { formatSafeDate, formatSafeDateTime, normalizeTaskAttachments } from "@/lib/task-format";

describe("RBAC & Charter Delimitations (04S, 09S, 11W)", () => {
  it("maps roles to dedicated dashboards", () => {
    expect(roleDashboardPath("SUPERADMIN")).toBe("/superadmin");
    expect(roleDashboardPath("ADMIN")).toBe("/admin");
    expect(roleDashboardPath("STUDENT")).toBe("/student");
  });
});

describe("Duty Hours Calculation & Schedule Validation (05S, 06S)", () => {
  it("distinguishes pending recorded hours from credited hours and requires 100h + tasks for completion", () => {
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
