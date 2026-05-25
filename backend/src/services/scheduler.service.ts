import cron from 'node-cron';
import { config } from '../config/config';
import { dbAll, logActivityAsync } from './db.service';
import { getCompanyConfig } from './companyConfig.service';
import { runWithCompanyContextAsync } from '../context/company.context';
import { logger } from '../utils/logger';
import { createScanRecord, runScanPipeline } from './scanPipeline.service';
import { registerActiveScan, unregisterActiveScan } from './scanTaskRegistry.service';
import { isMultiTenantEnabled } from './db.service';

let task: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  const schedule = config.cronSchedule;
  if (task) task.stop();

  task = cron.schedule(
    schedule,
    () => {
      void runScheduledScans();
    },
    { timezone: process.env.TZ || 'UTC' }
  );

  logger.info('Scheduler registered', { schedule });
}

async function runScheduledScans(): Promise<void> {
  logger.info('Scheduled scan started', { schedule: config.cronSchedule });
  const rows = await dbAll<{ id: number; domain: string; company_id: number | null }>(
    'SELECT id, domain, company_id FROM domains'
  );

  for (const row of rows) {
    try {
      const companyId = row.company_id ?? undefined;
      const settings = companyId ? await getCompanyConfig(companyId) : undefined;
      const store = companyId
        ? { companyId, email: '', companyName: '', settings }
        : undefined;

      const runOne = async () => {
        const created = await createScanRecord(row.domain, companyId, true);
        const controller = registerActiveScan(created.scanId, created.domain, companyId ?? null);
        await runScanPipeline(
          created.domain,
          { schedulerRun: true, sendEmail: true, createGithubIssues: true },
          { scanId: created.scanId, abortSignal: controller.signal }
        )
          .catch((e) => {
            logger.error('Scheduled scan failed for domain', { domain: row.domain, error: String(e) });
            void logActivityAsync('error', `Scheduled scan failed: ${row.domain}`, created.scanId, {
              error: String(e),
            }, companyId);
          })
          .finally(() => unregisterActiveScan(created.scanId));
      };

      if (store && isMultiTenantEnabled()) {
        await runWithCompanyContextAsync(store, runOne);
      } else {
        await runOne();
      }
    } catch (e) {
      logger.error('Scheduled scan failed for domain', { domain: row.domain, error: String(e) });
      void logActivityAsync('error', `Scheduled scan failed: ${row.domain}`, undefined, { error: String(e) });
    }
  }

  if (rows.length === 0) {
    void logActivityAsync('info', 'Scheduled scan: no domains registered');
  }
}

export function stopScheduler(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
