import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { DomainManagementComponent } from './components/domain-management/domain-management.component';
import { ScanResultsComponent } from './components/scan-results/scan-results.component';
import { IssueCreateComponent } from './components/issue-create/issue-create.component';
import { SettingsComponent } from './components/settings/settings.component';
import { AutomaticSchedulerComponent } from './components/automatic-scheduler/automatic-scheduler.component';
import { LoginComponent } from './components/auth/login.component';
import { SignupComponent } from './components/auth/signup.component';
import { authGuard, guestGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'signup', component: SignupComponent, canActivate: [guestGuard] },
  { path: '', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'domains', component: DomainManagementComponent, canActivate: [authGuard] },
  { path: 'scans', component: ScanResultsComponent, canActivate: [authGuard] },
  { path: 'issue-create', component: IssueCreateComponent, canActivate: [authGuard] },
  { path: 'automatic-scheduler', component: AutomaticSchedulerComponent, canActivate: [authGuard] },
  { path: 'issues', redirectTo: 'issue-create' },
  { path: 'pr-management', redirectTo: 'scans' },
  { path: 'settings', component: SettingsComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
