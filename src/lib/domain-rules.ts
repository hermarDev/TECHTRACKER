import { z } from "zod";
import { evaluateScheduleWindow } from "@/lib/hours";

export const attendanceInputSchema = z.object({
  action: z.enum(["TIME_IN", "TIME_OUT"]),
  scheduleId: z.string().min(1).optional(),
  attendanceId: z.string().min(1).optional(),
  shiftDate: z.string().min(1).optional(),
}).strict();

export function evaluateAttendanceSchedule(
  timeIn: Date,
  schedule: { startTime: string; endTime: string; graceMinutes: number }
) {
  return evaluateScheduleWindow({
    timeIn,
    scheduleStart: schedule.startTime,
    scheduleEnd: schedule.endTime,
    graceMinutes: schedule.graceMinutes,
  });
}

export function isMandatoryReviewRemarkValid(status: string, remarks: string) {
  return status !== "REJECTED" || remarks.trim().length > 0;
}

export function canMarkPreOjtCompleted(
  creditedHours: number,
  requiredHours: number,
  allAssignedTasksAccepted: boolean
) {
  return creditedHours >= requiredHours && allAssignedTasksAccepted;
}

export function isStudentVisibleRemark(remark: { visibility: string }) {
  return remark.visibility === "STUDENT_VISIBLE";
}

export const taskReviewInputSchema = z.object({
  assignmentId: z.string().min(1).optional(),
  status: z.enum(["ACCEPTED", "RETURNED"]),
  studentRemark: z.string().trim().max(4000).optional(),
  internalNote: z.string().trim().max(4000).optional(),
}).superRefine((value, ctx) => {
  if (value.status === "RETURNED" && !value.studentRemark) {
    ctx.addIssue({ code: "custom", path: ["studentRemark"], message: "Student-visible return remarks are mandatory." });
  }
});
