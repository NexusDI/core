import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router';
import clsx from 'clsx';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background',
  {
    variants: {
      variant: {
        default: 'bg-blue-500 text-white hover:bg-blue-600',
        green: 'bg-green-500 text-white hover:bg-green-600',
        purple: 'bg-purple-500 text-white hover:bg-purple-600',
        destructive: 'bg-red-500 text-white hover:bg-red-600',
        outline:
          'border border-input hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-10 py-2 px-4',
        sm: 'h-9 px-3 rounded-md',
        lg: 'h-11 px-8 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

type ButtonBaseProps = VariantProps<typeof buttonVariants> & {
  asLink?: boolean;
};

type ButtonProps = ButtonBaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { as?: 'button' };
type LinkButtonProps = ButtonBaseProps & LinkProps & { as: 'link' };

export const Button = ({
  className,
  variant,
  size,
  as = 'button',
  ...props
}: ButtonProps | LinkButtonProps) => {
  const classes = clsx(buttonVariants({ variant, size, className }));

  if (as === 'link') {
    return <Link className={classes} viewTransition {...(props as LinkProps)} />;
  }

  return <button className={classes} {...(props as ButtonProps)} />;
}; 