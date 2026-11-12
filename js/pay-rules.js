/** Pay rules Joe set: Monday–Saturday week, paid breaks, travel billed to the next job. */

export function allocateTravel(rows) {
  const work = (rows || [])
    .filter((row) => row && row.kind === "work" && row.status !== "void" && row.start && row.entryId)
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start) || String(a.entryId).localeCompare(String(b.entryId)));
  const breaks = (rows || []).filter((row) => row && row.kind === "break" && row.status !== "void" && row.start && row.end);
  const result = new Map();
  work.forEach((row, index) => {
    const base = {
      travelMinutes: 0,
      travelFromJobId: null,
      travelFromJobLabel: "",
      onSiteStart: row.start,
      intervalStart: row.start
    };
    const previous = index > 0 ? work[index - 1] : null;
    if (previous && previous.end && previous.dutyDate === row.dutyDate) {
      const arrival = new Date(row.start).getTime();
      const leftPrevious = new Date(previous.end).getTime();
      let gapMs = arrival - leftPrevious;
      if (gapMs > 0) {
        for (const pause of breaks) {
          if (pause.dutyDate && pause.dutyDate !== row.dutyDate) continue;
          const overlap = Math.min(arrival, new Date(pause.end).getTime()) - Math.max(leftPrevious, new Date(pause.start).getTime());
          if (overlap > 0) gapMs -= overlap;
        }
      }
      const travelMinutes = gapMs > 0 ? Math.round(gapMs / 60000) : 0;
      if (travelMinutes > 0) {
        base.travelMinutes = travelMinutes;
        base.travelFromJobId = previous.jobId || null;
        base.travelFromJobLabel = previous.jobLabel || "";
        base.intervalStart = previous.end;
      }
    }
    result.set(row.entryId, base);
  });
  return result;
}

export function billableMinutes(row) {
  const onSite = Number.isFinite(row.elapsedMinutes) ? row.elapsedMinutes : 0;
  if (row.kind === "break") return onSite;
  if (row.kind === "work") return onSite + (Number(row.travelMinutes) || 0);
  return 0;
}
