type ActiveScanTask = {
  scanId: number;
  domain: string;
  companyId: number | null;
  controller: AbortController;
  startedAt: string;
};

const activeScans = new Map<number, ActiveScanTask>();
const activeByDomain = new Map<string, number>();
const domainStartChains = new Map<string, Promise<void>>();

/** Serialize check + create for the same company/domain (prevents duplicate rows on double-click). */
export async function withDomainScanStartLock<T>(
  companyId: number | null | undefined,
  domain: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = domainKey(companyId, domain);
  const prev = domainStartChains.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chain = prev.then(() => gate);
  domainStartChains.set(key, chain);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (domainStartChains.get(key) === chain) domainStartChains.delete(key);
  }
}

function domainKey(companyId: number | null | undefined, domain: string): string {
  const d = domain.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  return `${companyId ?? 'legacy'}:${d}`;
}

export function findActiveScanIdForDomain(companyId: number | null | undefined, domain: string): number | null {
  const key = domainKey(companyId, domain);
  const scanId = activeByDomain.get(key);
  if (scanId != null && activeScans.has(scanId)) return scanId;
  return null;
}

export function registerActiveScan(
  scanId: number,
  domain: string,
  companyId?: number | null
): AbortController {
  const existing = activeScans.get(scanId);
  if (existing) return existing.controller;

  const controller = new AbortController();
  const cid = companyId ?? null;
  activeScans.set(scanId, {
    scanId,
    domain,
    companyId: cid,
    controller,
    startedAt: new Date().toISOString(),
  });
  activeByDomain.set(domainKey(cid, domain), scanId);
  return controller;
}

export function getActiveScan(scanId: number): ActiveScanTask | undefined {
  return activeScans.get(scanId);
}

export function unregisterActiveScan(scanId: number): void {
  const task = activeScans.get(scanId);
  if (task) {
    const key = domainKey(task.companyId, task.domain);
    if (activeByDomain.get(key) === scanId) activeByDomain.delete(key);
  }
  activeScans.delete(scanId);
}

export function stopActiveScan(scanId: number): boolean {
  const task = activeScans.get(scanId);
  if (!task) return false;
  task.controller.abort(new Error('Scan aborted by user'));
  return true;
}

export function listActiveScanIds(): number[] {
  return [...activeScans.keys()];
}

/** Marks in-flight scans failed before process exit (tsx watch / deploy restart). */
export async function failInFlightScansOnShutdown(): Promise<void> {
  const { dbExecute } = await import('./db.service');
  const { sqlNow } = await import('../helpers/companyScope');
  const msg =
    'Scan interrupted (server restarted or worker stopped). Delete or re-run this scan.';
  for (const scanId of listActiveScanIds()) {
    stopActiveScan(scanId);
    await dbExecute(
      `UPDATE scans SET status = 'failed', completed_at = ${sqlNow()}, email_error = ? WHERE id = ? AND status = 'running'`,
      [msg, scanId]
    );
    unregisterActiveScan(scanId);
  }
}
