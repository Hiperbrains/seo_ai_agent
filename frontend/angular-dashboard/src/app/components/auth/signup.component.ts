import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { httpErrorMessage } from '../../utils/http-error';
import { AuthHeroComponent } from './auth-hero.component';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AuthHeroComponent],
  templateUrl: './signup.component.html',
})
export class SignupComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  name = '';
  email = '';
  companyName = '';
  country = '';
  password = '';
  confirmPassword = '';
  agreedToTerms = false;
  showPassword = false;
  showConfirm = false;
  busy = false;
  error: string | null = null;

  private splitName(full: string): { firstName: string; lastName: string } {
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }

  submit(): void {
    this.error = null;
    if (this.password !== this.confirmPassword) {
      this.error = 'Passwords do not match';
      return;
    }
    const { firstName, lastName } = this.splitName(this.name);
    if (!firstName) {
      this.error = 'Please enter your name';
      return;
    }
    this.busy = true;
    this.auth
      .signup({
        firstName,
        lastName: lastName || firstName,
        email: this.email.trim(),
        companyName: this.companyName.trim(),
        password: this.password,
        confirmPassword: this.confirmPassword,
      })
      .subscribe({
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
