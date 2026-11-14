export function calculateSessionHours(timeIn: Date, timeOut: Date | null): number {
  if (!timeOut) return 0;
  const diffMs = timeOut.getTime() - timeIn.getTime();
  if (diffMs <= 0) return 0;
  return Math.round((diffMs / 3600000) * 100) / 100;
}

export function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function evaluateScheduleWindow(params: {
  timeIn: Date;
  scheduleStart: string;
  scheduleEnd: string;
  graceMinutes: number;
}): { isIrregular: boolean; irregularReason: string | null } {
  const punchMinutes = params.timeIn.getHours() * 60 + params.timeIn.getMinutes();
  const startMin = parseTimeToMinutes(params.scheduleStart);
  const endMin = parseTimeToMinutes(params.scheduleEnd);

  if (punchMinutes < startMin - params.graceMinutes) {
    return {
      isIrregular: true,
      irregularReason: `Early Time-In outside ${params.scheduleStart}–${params.scheduleEnd} (${params.graceMinutes}m grace)`,
    };
  }
  if (punchMinutes > endMin + params.graceMinutes) {
    return {
      isIrregular: true,
      irregularReason: `Late Time-In outside ${params.scheduleStart}–${params.scheduleEnd} (${params.graceMinutes}m grace)`,
    };
  }
  return { isIrregular: false, irregularReason: null };
}

export function computeHoursProgress(params: {
  logs: Array<{ status: string; recordedHours: number; creditedHours: number }>;
  requiredHours: number;
  allAssignedTasksAccepted: boolean;
}) {
  let pendingHours = 0;
  let creditedHours = 0;

  for (const log of params.logs) {
    if (log.status === "APPROVED") {
      creditedHours += log.creditedHours;
    } else if (log.status === "PENDING" || log.status === "ESCALATED") {
      pendingHours += log.recordedHours;
    }
  }

  pendingHours = Math.round(pendingHours * 100) / 100;
  creditedHours = Math.round(creditedHours * 100) / 100;
  const remainingHours = Math.max(0, Math.round((params.requiredHours - creditedHours) * 100) / 100);
  const percentCredited =
    params.requiredHours > 0
      ? Math.min(100, Math.round((creditedHours / params.requiredHours) * 1000) / 10)
      : 0;
  const preOjtEligibleForCompletion =
    creditedHours >= params.requiredHours && params.allAssignedTasksAccepted;

  return {
    pendingHours,
    creditedHours,
    remainingHours,
    requiredHours: params.requiredHours,
    percentCredited,
    preOjtEligibleForCompletion,
  };
}
