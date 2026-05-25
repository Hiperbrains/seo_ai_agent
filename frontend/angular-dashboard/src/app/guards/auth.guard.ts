import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, of, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const decide = (multiTenant: boolean) => {
    if (!multiTenant) return true;
    if (auth.isLoggedIn()) return true;
    return router.createUrlTree(['/login']);
  };

  if (auth.multiTenant() !== null) {
    return of(decide(auth.multiTenant()!));
  }

  return auth.loadAuthMode().pipe(
    take(1),
    map((m) => decide(m))
  );
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const decide = (multiTenant: boolean) => {
    if (!multiTenant) return router.createUrlTree(['/']);
    if (!auth.isLoggedIn()) return true;
    return router.createUrlTree(['/']);
  };

  if (auth.multiTenant() !== null) {
    return of(decide(auth.multiTenant()!));
  }

  return auth.loadAuthMode().pipe(
    take(1),
    map((m) => decide(m))
  );
};
