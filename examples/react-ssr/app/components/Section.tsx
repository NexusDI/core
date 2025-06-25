import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

const sectionVariants = cva('p-6 rounded-lg mb-8', {
  variants: {
    variant: {
      default: 'bg-white dark:bg-gray-800 shadow-md',
      subtle: 'bg-gray-50 dark:bg-gray-900',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type SectionProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof sectionVariants>;

export const Section = ({ className, variant, ...props }: SectionProps) => {
  return (
    <section
      className={clsx(sectionVariants({ variant, className }))}
      {...props}
    />
  );
};
