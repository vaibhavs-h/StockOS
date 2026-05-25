/**
 * Normalises a NextAuth session/provider user ID (which may be a numeric string
 * such as "107331917601880906344" for Google provider accounts) for database use.
 * 
 * Previously, this function generated a deterministic UUID from numeric IDs
 * to satisfy UUID column constraints. We now use the raw IDs as-is (with TEXT columns).
 */
export function getDbUserId(userId: string): string {
  return userId;
}
