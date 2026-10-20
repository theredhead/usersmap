import { provideHttpClient } from '@angular/common/http';
import { inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, Routes } from '@angular/router';
import { BUILT_IN_FIELDS, provideFormFields } from '@theredhead/lucid-forms';
import { THEME_CONFIG } from '@theredhead/lucid-theme';
import { App } from './app/app.component';
import { ApiService } from './app/core/api.service';
import { PrivacyRadiusField } from './app/locations/privacy-radius-field.component';

const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./app/dashboard/dashboard.component').then((module) => module.Dashboard),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./app/profile/profile-editor.component').then((module) => module.ProfileEditor),
  },
  {
    path: 'location',
    loadComponent: () =>
      import('./app/locations/location-editor.component').then((module) => module.LocationEditor),
  },
  {
    path: 'members/:id',
    loadComponent: () =>
      import('./app/profile/member-profile.component').then((module) => module.MemberProfile),
  },
  { path: '**', redirectTo: '' },
];

bootstrapApplication(App, {
  providers: [
    provideHttpClient(),
    provideRouter(routes),
    provideFormFields({
      ...BUILT_IN_FIELDS,
      'privacy-radius': { component: PrivacyRadiusField, modelProperty: 'value' },
    }),
    { provide: THEME_CONFIG, useValue: { defaultMode: 'dark', storageKey: 'newton-theme' } },
    provideAppInitializer(() => inject(ApiService).initialize()),
  ],
}).catch((error: unknown) => {
  console.error('Application startup failed.', error);
  const root = document.querySelector('app-root');
  if (root)
    root.textContent =
      'Unable to connect to the community. Please reload or contact the administrator.';
});
