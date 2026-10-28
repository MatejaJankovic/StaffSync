import { TestBed } from '@angular/core/testing';
import { CapacityRing } from './capacity-ring';

describe('CapacityRing', () => {
  function render(inputs: Record<string, unknown>): HTMLElement {
    const fixture = TestBed.createComponent(CapacityRing);
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function arcs(el: HTMLElement): SVGCircleElement[] {
    return Array.from(el.querySelectorAll<SVGCircleElement>('circle.capacity-ring__arc')).filter(
      (arc) => !arc.classList.contains('capacity-ring__arc--over'),
    );
  }

  function overflow(el: HTMLElement): Element | null {
    return el.querySelector('.capacity-ring__arc--over');
  }

  function text(el: HTMLElement, selector: string): string | undefined {
    return el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  }

  it('shows the load in text and describes the ring as one image', () => {
    const el = render({ load: 60, capacity: 100 });

    expect(text(el, '.capacity-ring__value')).toBe('60%');
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe('60% of 100% capacity used');
    expect(el.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('is free below 80% of the capacity, nearly full from 80% and full from 100%', () => {
    const tones: [number, string][] = [
      [79, 'free'],
      [80, 'nearly-full'],
      [99, 'nearly-full'],
      [100, 'full'],
      [101, 'full'],
    ];
    for (const [load, tone] of tones) {
      const el = render({ load, capacity: 100 });
      expect(el.classList).toContain(`capacity-ring--${tone}`);
    }
  });

  it("measures against the employee's own capacity", () => {
    const el = render({ load: 40, capacity: 50 });

    expect(el.classList).toContain('capacity-ring--nearly-full');
    expect(text(el, '.capacity-ring__value')).toBe('40%');
    expect(el.getAttribute('aria-label')).toBe('40% of 50% capacity used');
    // 80% of the circle: the dash offset is what is left of the 100 long path.
    expect(arcs(el)).toHaveLength(1);
    expect(arcs(el)[0].getAttribute('stroke-dashoffset')).toBe('20');
    expect(overflow(el)).toBeNull();
  });

  it('draws no arc at 0% and the whole circle at 100%', () => {
    expect(arcs(render({ load: 0, capacity: 100 }))).toHaveLength(0);

    const full = arcs(render({ load: 100, capacity: 100 }));
    expect(full).toHaveLength(1);
    expect(full[0].getAttribute('stroke-dashoffset')).toBe('0');
  });

  it('marks 100% with a fixed tick', () => {
    const el = render({ load: 10, capacity: 100 });

    expect(el.querySelector('line.capacity-ring__tick')).not.toBeNull();
  });

  it('adds an outer arc for the excess when overbooked, and says so in text', () => {
    const el = render({ load: 120, capacity: 100 });

    expect(el.classList).toContain('capacity-ring--over');
    expect(arcs(el)[0].getAttribute('stroke-dashoffset')).toBe('0');
    // 20% of the capacity is over, so 20% of the extra lap.
    expect(overflow(el)?.getAttribute('stroke-dashoffset')).toBe('80');
    expect(text(el, '.capacity-ring__flag')).toBe('!');
    expect(text(el, '.capacity-ring__sub')).toBe('Over');
    expect(el.getAttribute('aria-label')).toBe('120% of 100% capacity used, over capacity by 20%');
  });

  it('caps the excess arc at one extra lap', () => {
    const el = render({ load: 400, capacity: 100 });

    expect(overflow(el)?.getAttribute('stroke-dashoffset')).toBe('0');
  });

  it('is not overbooked at exactly 100%', () => {
    const el = render({ load: 100, capacity: 100 });

    expect(el.classList).not.toContain('capacity-ring--over');
    expect(overflow(el)).toBeNull();
    expect(el.querySelector('.capacity-ring__flag')).toBeNull();
  });

  it('draws one arc per project, each in its own tint, and lists them in the label', () => {
    const el = render({
      load: 80,
      capacity: 100,
      segments: [
        { label: 'Apollo', percent: 50 },
        { label: 'Hermes', percent: 30 },
      ],
    });

    const drawn = arcs(el);
    expect(drawn).toHaveLength(2);
    expect(drawn[0].classList).toContain('capacity-ring__arc--tint-0');
    expect(drawn[1].classList).toContain('capacity-ring__arc--tint-1');
    // The second arc starts where the first one ends: 50% of the circle is 180 degrees from the top.
    expect(drawn[0].getAttribute('transform')).toBe('rotate(-90 50 50)');
    expect(drawn[1].getAttribute('transform')).toBe('rotate(90 50 50)');
    expect(el.getAttribute('aria-label')).toBe('80% of 100% capacity used. Apollo 50%, Hermes 30%');
  });

  it('scales the project arcs to the employee own capacity and never draws past one lap', () => {
    const el = render({
      load: 60,
      capacity: 50,
      segments: [
        { label: 'A', percent: 40 },
        { label: 'B', percent: 20 },
      ],
    });

    const drawn = arcs(el);
    expect(drawn).toHaveLength(2);
    // A is 80% of the ring, B would be 40% but only 20% is left.
    expect(Number(drawn[1].getAttribute('stroke-dashoffset'))).toBeGreaterThan(79);
    expect(overflow(el)).not.toBeNull();
  });

  it('skips projects without a share and repeats the tints after four projects', () => {
    const el = render({
      load: 50,
      capacity: 100,
      segments: [
        { label: 'None', percent: 0 },
        { label: 'A', percent: 10 },
        { label: 'B', percent: 10 },
        { label: 'C', percent: 10 },
        { label: 'D', percent: 10 },
        { label: 'E', percent: 10 },
      ],
    });

    const drawn = arcs(el);
    expect(drawn).toHaveLength(5);
    expect(drawn[4].classList).toContain('capacity-ring__arc--tint-0');
  });

  it('shows a legend only at the large size', () => {
    const segments = [{ label: 'Apollo', percent: 50 }];

    expect(
      render({ load: 50, capacity: 100, segments }).querySelector('.capacity-ring__legend'),
    ).toBeNull();
    const lg = render({ load: 50, capacity: 100, segments, size: 'lg' });
    expect(text(lg, '.capacity-ring__legend-label')).toBe('Apollo');
    expect(text(lg, '.capacity-ring__legend-value')).toBe('50%');
  });

  it('defaults to the medium size and sets a class per size', () => {
    expect(render({ load: 1, capacity: 100 }).classList).toContain('capacity-ring--md');
    expect(render({ load: 1, capacity: 100, size: 'sm' }).classList).toContain('capacity-ring--sm');
    expect(render({ load: 1, capacity: 100, size: 'lg' }).classList).toContain('capacity-ring--lg');
  });

  it('writes "of 100%" under the number at the large size only', () => {
    expect(text(render({ load: 60, capacity: 100, size: 'lg' }), '.capacity-ring__sub')).toBe(
      'of 100%',
    );
    expect(text(render({ load: 40, capacity: 50, size: 'lg' }), '.capacity-ring__sub')).toBe(
      'of 50%',
    );
    expect(render({ load: 60, capacity: 100 }).querySelector('.capacity-ring__sub')).toBeNull();
  });

  it('keeps the "!" mark at the small size, where there is no room for the word', () => {
    const el = render({ load: 150, capacity: 100, size: 'sm' });

    expect(text(el, '.capacity-ring__flag')).toBe('!');
    expect(el.querySelector('.capacity-ring__sub')).toBeNull();
  });

  it('adds the label to the text label, and shows it under the ring only on request', () => {
    const hidden = render({ load: 120, capacity: 100, label: 'Over capacity' });
    expect(hidden.querySelector('.capacity-ring__label')).toBeNull();
    expect(hidden.getAttribute('aria-label')).toContain('Over capacity');

    const shown = render({ load: 120, capacity: 100, label: 'Over capacity', showLabel: true });
    expect(text(shown, '.capacity-ring__label')).toBe('Over capacity');
  });

  it('treats zero capacity as full without any NaN in the SVG', () => {
    for (const el of [render({ load: 0, capacity: 0 }), render({ load: 30, capacity: 0 })]) {
      expect(el.classList).toContain('capacity-ring--full');
      expect(el.innerHTML).not.toContain('NaN');
      expect(el.getAttribute('aria-label')).not.toContain('NaN');
      expect(arcs(el)[0].getAttribute('stroke-dashoffset')).toBe('0');
    }
  });

  it('survives invalid numbers', () => {
    const el = render({
      load: Number.NaN,
      capacity: -5,
      segments: [{ label: 'X', percent: Number.NaN }],
    });

    expect(el.innerHTML).not.toContain('NaN');
    expect(el.innerHTML).not.toContain('Infinity');
    expect(text(el, '.capacity-ring__value')).toBe('0%');
  });

  it('can be hidden from assistive tech when text beside it says the same', () => {
    const shown = render({ load: 60, capacity: 100 });
    expect(shown.getAttribute('role')).toBe('img');
    expect(shown.hasAttribute('aria-hidden')).toBe(false);

    const hidden = render({ load: 60, capacity: 100, decorative: true });
    expect(hidden.getAttribute('aria-hidden')).toBe('true');
    expect(hidden.hasAttribute('role')).toBe(false);
    expect(hidden.hasAttribute('aria-label')).toBe(false);
    expect(text(hidden, '.capacity-ring__value')).toBe('60%');
  });

  it('can leave the middle empty, with the arcs and the mark still drawn', () => {
    const el = render({ load: 120, capacity: 100, showValue: false });

    expect(el.querySelector('.capacity-ring__value')).toBeNull();
    expect(el.querySelector('.capacity-ring__sub')).toBeNull();
    expect(el.querySelector('.capacity-ring__flag')).not.toBeNull();
    expect(el.getAttribute('aria-label')).toContain('120% of 100%');
  });

  it('does not animate by default, and sweeps the arcs in when asked to', () => {
    const still = render({ load: 60, capacity: 100 });
    expect(still.querySelector('.ss-ring-sweep')).toBeNull();

    const sweeping = render({ load: 120, capacity: 100, animate: true });
    expect(sweeping.querySelectorAll('.ss-ring-sweep')).toHaveLength(2);
  });
});
