/**
 * Compute an age in whole years from an ISO `date_of_birth` string.
 * Returns null if no DOB is set or the value is unparseable.
 */
export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const then = new Date(dob);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - then.getFullYear();
  const monthDelta = now.getMonth() - then.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < then.getDate())) {
    years--;
  }
  return Math.max(years, 0);
}
