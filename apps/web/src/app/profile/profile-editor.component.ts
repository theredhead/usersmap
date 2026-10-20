import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormEngine, FormValues, UIForm } from '@theredhead/lucid-forms';
import { UIAvatar } from '@theredhead/lucid-kit';
import { ApiService } from '../core/api.service';
import { PROFILE_INTL } from '../core/feature-intl';
import { profileSchema } from '../core/form-schemas';
import { selectedFile, ComposerState } from '../timeline/timeline.component';
import { CommunityStore } from '../core/community.store';

@Component({
  selector: 'app-profile-editor',
  imports: [UIForm, UIAvatar, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-editor.component.html',
  styleUrl: './profile-editor.component.scss',
})
export class ProfileEditor {
  readonly api = inject(ApiService);
  readonly intl = inject(PROFILE_INTL);
  private readonly router = inject(Router);
  private readonly store = inject(CommunityStore);
  private readonly composer = inject(ComposerState);
  readonly engine = new FormEngine(profileSchema(this.api.configuration()!, this.intl));
  readonly deletionEngine = new FormEngine({
    id: 'deletion',
    groups: [
      {
        id: 'confirm',
        fields: [
          {
            id: 'confirmed',
            title: 'I understand this permanently deletes my account.',
            component: 'checkbox',
            validation: [{ type: 'required', message: 'Confirm deletion to continue.' }],
          },
        ],
      },
    ],
  });

  constructor() {
    const member = this.api.session().member;
    if (member) {
      for (const key of [
        'nickname',
        'punchline',
        'bio',
        'birthYear',
        'birthMonth',
        'birthDay',
        'unit',
      ] as const) {
        this.engine.setValue(key, member[key] ?? '');
      }
      const customFields = this.api
        .configuration()!
        .profileSchema.groups.flatMap((group) => group.fields);
      for (const field of customFields) {
        if (field.id in member.customAnswers)
          this.engine.setValue(field.id, member.customAnswers[field.id]);
      }
    }
  }

  save(values: FormValues): void {
    void this.api.run(async () => {
      const customAnswers: Record<string, unknown> = {};
      for (const group of this.api.configuration()!.profileSchema.groups) {
        for (const field of group.fields) customAnswers[field.id] = values[field.id];
      }
      await this.api.write('PUT', 'me', {
        nickname: values['nickname'],
        punchline: values['punchline'] || '',
        bio: values['bio'] || '',
        birthYear: values['birthYear'],
        birthMonth: values['birthMonth'],
        birthDay: values['birthDay'],
        unit: values['unit'],
        customAnswers,
      });
      const avatar = selectedFile(values['avatar']);
      if (avatar) {
        const form = new FormData();
        form.append('file', avatar);
        await this.api.write('POST', 'media/avatar', form);
      }
      await this.api.refreshSession();
      await this.store.refreshMembers();
      this.api.notice.set('Your profile is saved. Welcome to the neighborhood.');
      await this.router.navigateByUrl('/');
    });
  }

  deleteAccount(): void {
    void this.api.run(async () => {
      await this.api.write('DELETE', 'me');
      this.store.stop();
      this.composer.reset();
      this.api.session.set({ member: null, csrfToken: null });
      this.api.notice.set('Your account and personal data have been deleted.');
      await this.router.navigateByUrl('/');
    });
  }
}
