import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../../../app/components/Button';

describe('Button Component', () => {
  it('should render button with default variant', () => {
    render(<Button>Click me</Button>);
    
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('bg-blue-500');
  });

  it('should render button with different variants', () => {
    const { rerender } = render(<Button variant="green">Green Button</Button>);
    
    let button = screen.getByRole('button', { name: /green button/i });
    expect(button).toHaveClass('bg-green-500');

    rerender(<Button variant="purple">Purple Button</Button>);
    button = screen.getByRole('button', { name: /purple button/i });
    expect(button).toHaveClass('bg-purple-500');

    rerender(<Button variant="destructive">Destructive Button</Button>);
    button = screen.getByRole('button', { name: /destructive button/i });
    expect(button).toHaveClass('bg-red-500');
  });

  it('should handle click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    const button = screen.getByRole('button', { name: /click me/i });
    button.click();
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled Button</Button>);
    
    const button = screen.getByRole('button', { name: /disabled button/i });
    expect(button).toBeDisabled();
  });

  it('should apply custom className', () => {
    render(<Button className="custom-class">Custom Button</Button>);
    
    const button = screen.getByRole('button', { name: /custom button/i });
    expect(button).toHaveClass('custom-class');
  });
}); 