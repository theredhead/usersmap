import { ChangeDetectionStrategy, Component, inject, input, model } from '@angular/core';
import { UISlider, type SliderValue } from '@theredhead/lucid-kit';
import { COMMUNITY_INTL } from '../core/feature-intl';

@Component({
  selector: 'app-privacy-radius-field',
  imports: [UISlider],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './privacy-radius-field.component.html',
  styleUrl: './privacy-radius-field.component.scss',
})
export class PrivacyRadiusField {
  readonly intl = inject(COMMUNITY_INTL);
  readonly value = model(5);
  readonly min = input(1);
  readonly max = input(25);
  readonly step = input(1);
  readonly unit = input<'km' | 'mi'>('km');
  readonly disabled = input(false);

  change(value: SliderValue): void {
    if (typeof value !== 'number') throw new Error('The privacy radius must be a single number.');
    this.value.set(value);
  }
}
