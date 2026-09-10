export function addBusinessDays(startDate, days) {
  const d = new Date(`${startDate}T00:00:00Z`);
  let remaining = Number(days);
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return d.toISOString().slice(0, 10);
}

export function maxDeadline(startDate) {
  return addBusinessDays(startDate, 15);
}

export function isValidDeadline(startDate, deadline) {
  return deadline >= startDate && deadline <= maxDeadline(startDate);
}

export function isLate(status, deadline) {
  if (['Concluído','Cancelado'].includes(status)) return false;
  const today = new Date().toISOString().slice(0,10);
  return deadline < today;
}
