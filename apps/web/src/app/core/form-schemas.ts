import { registerCustomValidator, type FormSchema } from '@theredhead/lucid-forms';
import type { RichTextFormatAction } from '@theredhead/lucid-blocks';
import type { ProfileIntl } from './feature-intl';
import type { PublicConfiguration } from '../../../../../shared/contracts';
import { isVideoLink } from '../../../../../shared/video-link';

registerCustomValidator('postCharacterLimit', (value) =>
  typeof value === 'string' && Array.from(value).length > 250
    ? { type: 'custom', message: 'Use 250 characters or fewer.' }
    : null,
);
registerCustomValidator('videoLink', (value) =>
  value === '' ||
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.trim().length <= 2048 && isVideoLink(value.trim()))
    ? null
    : { type: 'custom', message: 'Use a full HTTPS video link, such as a YouTube or Vimeo URL.' },
);

export function profileSchema(configuration: PublicConfiguration, intl: ProfileIntl): FormSchema {
  return {
    id: 'profile',
    groups: [
      {
        id: 'about',
        title: 'The basics',
        fields: [
          {
            id: 'nickname',
            title: intl.nickname,
            component: 'text',
            validation: [
              { type: 'required', message: 'A nickname is required.' },
              { type: 'maxLength', params: { max: 60 }, message: 'Use 60 characters or fewer.' },
            ],
          },
          {
            id: 'punchline',
            title: intl.punchline,
            component: 'text',
            config: { placeholder: 'A few words that sound like you' },
          },
          {
            id: 'bio',
            title: intl.biography,
            component: 'richtext',
            config: {
              toolbarActions: [
                'undo',
                'redo',
                'bold',
                'italic',
                'underline',
                'strikethrough',
                'unorderedList',
                'orderedList',
                'indent',
                'outdent',
                'alignLeft',
                'alignCenter',
                'alignRight',
                'alignJustify',
              ] satisfies RichTextFormatAction[],
            },
          },
        ],
      },
      {
        id: 'preferences',
        title: 'A little more (all optional)',
        fields: [
          { id: 'birthYear', title: intl.birthYear, component: 'text', config: { type: 'number' } },
          {
            id: 'birthMonth',
            title: intl.birthMonth,
            component: 'text',
            config: { type: 'number' },
          },
          { id: 'birthDay', title: intl.birthDay, component: 'text', config: { type: 'number' } },
          {
            id: 'unit',
            title: intl.unit,
            component: 'radio',
            defaultValue: 'km',
            options: [
              { label: 'Kilometers', value: 'km' },
              { label: 'Miles', value: 'mi' },
            ],
          },
          {
            id: 'avatar',
            title: intl.avatar,
            component: 'file',
            config: {
              accept: 'image/png,image/jpeg,image/webp',
              multiple: false,
              maxFileSize: configuration.maximumUploadBytes,
            },
          },
        ],
      },
      ...configuration.profileSchema.groups,
    ],
  };
}

export const composerSchema: FormSchema = {
  id: 'post',
  groups: [
    {
      id: 'message',
      fields: [
        {
          id: 'body',
          title: 'Share a little update',
          component: 'text',
          config: {
            multiline: true,
            rows: 3,
            placeholder: 'What’s happening in your corner of the Newton world?',
          },
          validation: [
            {
              type: 'custom',
              params: { validatorId: 'postCharacterLimit' },
              message: 'Use 250 characters or fewer.',
            },
          ],
        },
        {
          id: 'videoUrl',
          title: 'Video link (optional)',
          component: 'text',
          config: { type: 'url', placeholder: 'https://www.youtube.com/watch?v=…' },
          description:
            'Paste a link from YouTube, Vimeo, or another video platform. Opens on that site.',
          validation: [
            {
              type: 'custom',
              params: { validatorId: 'videoLink' },
              message: 'Use a full HTTPS video link.',
            },
          ],
        },
        {
          id: 'attachment',
          title: 'Upload a photo or video instead (optional)',
          component: 'file',
          config: {
            accept: 'image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime',
            multiple: false,
          },
        },
      ],
    },
  ],
};
