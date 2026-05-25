/** SQLite uses ? placeholders; PostgreSQL uses $1, $2, ... */
export function toPgPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export function nowExpr(driver: 'sqlite' | 'postgres'): string {
  return driver === 'postgres' ? 'NOW()' : "datetime('now')";
}

export function upsertDomainSql(driver: 'sqlite' | 'postgres'): string {
  if (driver === 'sqlite') {
    return `INSERT OR IGNORE INTO domains (company_id, domain) VALUES (?, ?)`;
  }
  return `INSERT INTO domains (company_id, domain) VALUES ($1, $2) ON CONFLICT (company_id, domain) DO NOTHING`;
}
