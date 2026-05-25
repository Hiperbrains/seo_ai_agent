import type { Response } from 'express';
import type { AuthRequest } from '../context/company.context';
import { loginCompany, signupCompany } from '../services/auth.service';
import { isMultiTenantEnabled } from '../services/db.service';
import { logger } from '../utils/logger';

export async function postSignup(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isMultiTenantEnabled()) {
      res.status(400).json({ error: 'Signup requires PostgreSQL (set DATABASE_URL)' });
      return;
    }
    const body = req.body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      password?: string;
      companyName?: string;
      confirmPassword?: string;
    };

    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const confirmPassword = String(body.confirmPassword || body.password || '');
    const companyName = String(body.companyName || '').trim();

    if (!firstName || !lastName || !email || !password || !companyName) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match' });
      return;
    }

    const result = await signupCompany({ firstName, lastName, email, password, companyName });
    res.status(201).json({
      ok: true,
      token: result.token,
      company: {
        id: result.company.companyId,
        email: result.company.email,
        companyName: result.company.companyName,
      },
    });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    if (msg.includes('already exists')) {
      res.status(409).json({ error: msg });
      return;
    }
    logger.error('postSignup', { error: msg });
    res.status(500).json({ error: msg });
  }
}

export async function postLogin(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isMultiTenantEnabled()) {
      res.status(400).json({ error: 'Login requires PostgreSQL (set DATABASE_URL)' });
      return;
    }
    const email = String((req.body as { email?: string })?.email || '').trim();
    const password = String((req.body as { password?: string })?.password || '');
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await loginCompany({ email, password });
    res.json({
      ok: true,
      token: result.token,
      company: {
        id: result.company.companyId,
        email: result.company.email,
        companyName: result.company.companyName,
      },
    });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    if (msg.includes('Invalid')) {
      res.status(401).json({ error: msg });
      return;
    }
    logger.error('postLogin', { error: msg });
    res.status(500).json({ error: msg });
  }
}

export function getAuthMe(req: AuthRequest, res: Response): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json({
    ok: true,
    company: {
      id: req.auth.companyId,
      email: req.auth.email,
      companyName: req.auth.companyName,
    },
  });
}

export function getAuthMode(_req: AuthRequest, res: Response): void {
  res.json({ multiTenant: isMultiTenantEnabled() });
}
