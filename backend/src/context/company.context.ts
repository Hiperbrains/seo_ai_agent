import { AsyncLocalStorage } from 'async_hooks';
import type { Request as ExpressRequest } from 'express';

export interface CompanyContextStore {
  companyId: number;
  email: string;
  companyName: string;
  /** Loaded per request / scan job for sync secret reads */
  settings?: Record<string, string>;
}

export const companyContext = new AsyncLocalStorage<CompanyContextStore>();

export function getContextCompanyId(): number | undefined {
  return companyContext.getStore()?.companyId;
}

export function runWithCompanyContext<T>(store: CompanyContextStore, fn: () => T): T {
  return companyContext.run(store, fn);
}

export function runWithCompanyContextAsync<T>(store: CompanyContextStore, fn: () => Promise<T>): Promise<T> {
  return companyContext.run(store, fn);
}

export interface AuthRequest extends ExpressRequest {
  auth?: CompanyContextStore;
}

export function getRequestCompanyId(req: AuthRequest): number | undefined {
  return req.auth?.companyId ?? getContextCompanyId();
}
