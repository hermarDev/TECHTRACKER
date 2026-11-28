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
