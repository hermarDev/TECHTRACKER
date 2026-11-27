export type Role = "SUPERADMIN" | "ADMIN" | "STUDENT";

export type UserStatus =
  | "PENDING_VERIFICATION"
  | "ACTIVE"
  | "SUSPENDED"
  | "DEACTIVATED";

export type TaskAssignmentStatus =
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "RETURNED"
  | "ACCEPTED";

export type AttendanceStatus = "PENDING" | "APPROVED" | "REJECTED" | "ESCALATED";

export type InspectionStatus = "SUBMITTED" | "REVIEWED";

export type EmailOutboxEntry = {
  id: string;
  category: string;
  subject: string;
  toEmail: string;
  body: string;
  createdAt: string;
};
