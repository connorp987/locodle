export function getEasternDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Human-friendly label for a YYYY-MM-DD string. Parses as local (no UTC
// shift) and flags the current Eastern day as "Today".
export function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const label = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return dateStr === getEasternDateString() ? `Today · ${label}` : label;
}
