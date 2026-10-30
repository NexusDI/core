import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CoursePlotter } from '../app/components/CoursePlotter';

describe('CoursePlotter', () => {
  it('shows the heading of the course the plot prop answers', () => {
    const plot = vi.fn((to: string) => ({ to, heading: 42 }));
    render(<CoursePlotter plot={plot} />);
    expect(screen.getByText('heading 42', { exact: false })).toBeDefined();
    expect(plot).toHaveBeenCalledWith('Proxima-b');
  });

  it('shows the refusal the plot prop answers and keeps rendering', () => {
    const plot = (to: string) =>
      to === 'V' ? { refused: 'V is not charted' } : { to, heading: 7 };
    render(<CoursePlotter plot={plot} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'V' } });
    expect(screen.getByText('V is not charted')).toBeDefined();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Vega' },
    });
    expect(screen.getByText('heading 7', { exact: false })).toBeDefined();
    expect(screen.queryByText('V is not charted')).toBeNull();
  });
});
