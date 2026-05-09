/**
 * Lightweight In-Memory Lock Manager
 * Designed to be swapped with Redis locks (e.g. redlock) later.
 */
export class LockManager {
  private activeLocks: Set<string> = new Set();

  /**
   * Attempts to acquire a lock for a given key.
   * Returns true if successful, false if already locked.
   */
  public acquire(key: string): boolean {
    if (this.activeLocks.has(key)) {
      return false;
    }
    this.activeLocks.add(key);
    return true;
  }

  /**
   * Releases a lock for a given key.
   */
  public release(key: string): void {
    this.activeLocks.delete(key);
  }

  /**
   * Checks if a lock exists without acquiring it.
   */
  public isLocked(key: string): boolean {
    return this.activeLocks.has(key);
  }

  /**
   * Clears all locks (e.g., on process reset).
   */
  public clearAll(): void {
    this.activeLocks.clear();
  }
}

export const syncLockManager = new LockManager();
