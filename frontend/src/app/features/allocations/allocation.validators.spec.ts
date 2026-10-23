import { FormControl } from '@angular/forms';
import { textLength } from './allocation.validators';

describe('textLength', () => {
  const errors = (value: string | null) => textLength(new FormControl(value));

  it('requires some text, not only spaces', () => {
    expect(errors(null)).toEqual({ required: true });
    expect(errors('')).toEqual({ required: true });
    expect(errors('   ')).toEqual({ required: true });
  });

  it('counts at least 10 characters without the surrounding spaces', () => {
    expect(errors('  Too short ')).toEqual({ tooShort: true });
    expect(errors(' Long enough ')).toBeNull();
    expect(errors('0123456789')).toBeNull();
  });
});
