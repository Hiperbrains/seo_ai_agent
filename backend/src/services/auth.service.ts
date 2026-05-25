import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config/config';
import { dbExecute, dbQueryOne, getDriver, initDb } from './db.service';
import type { CompanyContextStore } from '../context/company.context';

const BCRYPT_ROUNDS = 12;

export interface SignupInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokenPayload {
  companyId: number;
  email: string;
  companyName: string;
}

export interface CompanyRow {
  id: number;
  company_name: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function signupCompany(input: SignupInput): Promise<{ token: string; company: CompanyContextStore }> {
  await initDb();
  const email = normalizeEmail(input.email);
  const existing = await dbQueryOne<CompanyRow>('SELECT id FROM companies WHERE email = ?', [email]);
  if (existing) {
    throw new Error('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const nowSql = getDriver() === 'postgres' ? 'NOW()' : "datetime('now')";
  let companyId: number | undefined;

  if (getDriver() === 'postgres') {
    const row = await dbQueryOne<{ id: number }>(
      `INSERT INTO companies (company_name, email, password_hash, first_name, last_name, updated_at)
       VALUES (?, ?, ?, ?, ?, ${nowSql}) RETURNING id`,
      [input.companyName.trim(), email, passwordHash, input.firstName.trim(), input.lastName.trim()]
    );
    companyId = row?.id;
  } else {
    const ins = await dbExecute(
      `INSERT INTO companies (company_name, email, password_hash, first_name, last_name, updated_at)
       VALUES (?, ?, ?, ?, ?, ${nowSql})`,
      [input.companyName.trim(), email, passwordHash, input.firstName.trim(), input.lastName.trim()]
    );
    companyId = ins.lastInsertId;
  }

  if (!companyId) throw new Error('Failed to create company');

  if (getDriver() === 'postgres') {
    await dbExecute(
      `INSERT INTO company_configs (company_id, settings, updated_at) VALUES (?, '{}'::jsonb, ${nowSql})`,
      [companyId]
    );
  } else {
    await dbExecute(
      `INSERT INTO company_configs (company_id, settings, updated_at) VALUES (?, ?, ${nowSql})`,
      [companyId, '{}']
    );
  }

  const store: CompanyContextStore = {
    companyId,
    email,
    companyName: input.companyName.trim(),
  };
  return { token: signToken(store), company: store };
}

export async function loginCompany(input: LoginInput): Promise<{ token: string; company: CompanyContextStore }> {
  await initDb();
  const email = normalizeEmail(input.email);
  const row = await dbQueryOne<CompanyRow>(
    'SELECT id, company_name, email, password_hash, first_name, last_name FROM companies WHERE email = ?',
    [email]
  );
  if (!row) throw new Error('Invalid email or password');

  const valid = await bcrypt.compare(input.password, row.password_hash);
  if (!valid) throw new Error('Invalid email or password');

  const store: CompanyContextStore = {
    companyId: row.id,
    email: row.email,
    companyName: row.company_name,
  };
  return { token: signToken(store), company: store };
}

export function signToken(store: CompanyContextStore): string {
  const payload: AuthTokenPayload = {
    companyId: store.companyId,
    email: store.email,
    companyName: store.companyName,
  };
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as SignOptions);
}

export function verifyToken(token: string): CompanyContextStore | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
    if (!decoded?.companyId) return null;
    return {
      companyId: decoded.companyId,
      email: decoded.email,
      companyName: decoded.companyName,
    };
  } catch {
    return null;
  }
}
