import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

const cardVariants = cva('rounded-lg shadow-lg overflow-hidden', {
  variants: {
    variant: {
      default: 'bg-white dark:bg-gray-800',
      outline: 'border border-gray-200 dark:border-gray-700',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type CardProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants>;

export const Card = ({ className, variant, ...props }: CardProps) => {
  return (
    <div className={clsx(cardVariants({ variant, className }))} {...props} />
  );
};

export const CardHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={clsx(
      'p-4 border-b border-gray-200 dark:border-gray-700',
      className
    )}
    {...props}
  />
);

export const CardTitle = ({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) => (
  <h3
    className={clsx('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
);

export const CardContent = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={clsx('p-4', className)} {...props} />
); 