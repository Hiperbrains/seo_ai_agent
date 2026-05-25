import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { httpErrorMessage } from '../../utils/http-error';
import { AuthHeroComponent } from './auth-hero.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AuthHeroComponent],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  agreedToTerms = false;
  showPassword = false;
  busy = false;
  error: string | null = null;

  submit(): void {
    this.error = null;
    this.busy = true;
    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => {
        this.busy = false;
        void this.router.navigate(['/']);
      },
      error: (e) => {
        this.busy = false;
        this.error = httpErrorMessage(e);
      },
    });
  }
}
