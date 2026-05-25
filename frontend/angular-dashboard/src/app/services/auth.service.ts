import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, map, of, catchError } from 'rxjs';
import { environment } from '../../environments/environment';

const TOKEN_KEY = 'seo_agent_token';
const COMPANY_KEY = 'seo_agent_company';

export interface AuthCompany {
  id: number;
  email: string;
  companyName: string;
}

export interface AuthSession {
  token: string;
  company: AuthCompany;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = environment.apiUrl;

  readonly multiTenant = signal<boolean | null>(null);
  readonly company = signal<AuthCompany | null>(this.loadCompany());

  loadAuthMode(): Observable<boolean> {
    return this.http.get<{ multiTenant: boolean }>(`${this.base}/auth/mode`).pipe(
      map((r) => r.multiTenant),
      tap((m) => this.multiTenant.set(m)),
      catchError(() => {
        this.multiTenant.set(false);
        return of(false);
      })
    );
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  signup(body: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword: string;
    companyName: string;
  }): Observable<AuthSession> {
    return this.http
      .post<{ token: string; company: AuthCompany }>(`${this.base}/auth/signup`, body)
      .pipe(tap((r) => this.persistSession(r)));
  }

  login(email: string, password: string): Observable<AuthSession> {
    return this.http
      .post<{ token: string; company: AuthCompany }>(`${this.base}/auth/login`, { email, password })
      .pipe(tap((r) => this.persistSession(r)));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(COMPANY_KEY);
    this.company.set(null);
    void this.router.navigate(['/login']);
  }

  private persistSession(r: { token: string; company: AuthCompany }): void {
    localStorage.setItem(TOKEN_KEY, r.token);
    localStorage.setItem(COMPANY_KEY, JSON.stringify(r.company));
    this.company.set(r.company);
  }

  private loadCompany(): AuthCompany | null {
    const raw = localStorage.getItem(COMPANY_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthCompany;
    } catch {
      return null;
    }
  }
}
