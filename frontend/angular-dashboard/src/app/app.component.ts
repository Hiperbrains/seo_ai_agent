import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly showShell = signal(!this.isAuthRoute(this.router.url));

  constructor() {
    this.auth.loadAuthMode().subscribe();
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.showShell.set(!this.isAuthRoute(this.router.url));
    });
  }

  signOut(): void {
    this.auth.logout();
  }

  private isAuthRoute(url: string): boolean {
    return url.startsWith('/login') || url.startsWith('/signup');
  }
}
