import { describe, expect, it } from "vitest";
import {
  attendanceInputSchema,
  evaluateAttendanceSchedule,
  isMandatoryReviewRemarkValid,
  canMarkPreOjtCompleted,
  isStudentVisibleRemark,
  taskReviewInputSchema,
} from "@/lib/domain-rules";

describe("Domain B attendance and task rules", () => {
  it("rejects GPS/geolocation fields instead of accepting or storing them", () => {
    const result = attendanceInputSchema.safeParse({
      scheduleId: "schedule-1",
      shiftDate: "2026-11-15",
      latitude: 10.3,
      longitude: 123.9,
      geolocation: { latitude: 10.3, longitude: 123.9 },
    });

    expect(result.success).toBe(false);
  });

  it("flags time-in outside the schedule grace window as irregular", () => {
    const result = evaluateAttendanceSchedule(
      new Date("2026-11-15T18:00:00"),
      { startTime: "08:00", endTime: "17:00", graceMinutes: 15 }
    );

    expect(result.isIrregular).toBe(true);
    expect(result.irregularReason).toMatch(/outside/i);
  });

  it("requires remarks when rejecting attendance", () => {
    expect(isMandatoryReviewRemarkValid("REJECTED", "")).toBe(false);
    expect(isMandatoryReviewRemarkValid("REJECTED", "Photo is unclear")).toBe(true);
    expect(isMandatoryReviewRemarkValid("APPROVED", "")).toBe(true);
  });

  it("completes pre-OJT only when credited hours and all tasks qualify", () => {
    expect(canMarkPreOjtCompleted(100, 100, true)).toBe(true);
    expect(canMarkPreOjtCompleted(100, 100, false)).toBe(false);
    expect(canMarkPreOjtCompleted(99.99, 100, true)).toBe(false);
  });

  it("requires student-visible remarks when a task is returned", () => {
    expect(taskReviewInputSchema.safeParse({ status: "RETURNED" }).success).toBe(false);
    expect(
      taskReviewInputSchema.safeParse({
        status: "RETURNED",
        studentRemark: "Please include the diagnostic results.",
      }).success
    ).toBe(true);
  });

  it("does not expose internal staff remarks to students", () => {
    expect(isStudentVisibleRemark({ visibility: "STUDENT_VISIBLE" })).toBe(true);
    expect(isStudentVisibleRemark({ visibility: "INTERNAL_STAFF_ONLY" })).toBe(false);
  });
});
