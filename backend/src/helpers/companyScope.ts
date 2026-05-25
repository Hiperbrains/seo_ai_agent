import { getDriver } from '../services/db.service';

export function sqlNow(): string {
  return getDriver() === 'postgres' ? 'NOW()' : "datetime('now')";
}

export function companyDomainWhere(companyId: number | undefined, domainAlias = 'd'): { clause: string; params: unknown[] } {
  if (companyId == null) return { clause: '1=1', params: [] };
  return { clause: `${domainAlias}.company_id = ?`, params: [companyId] };
}
