import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  imageUrl: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Modern & Type-Safe',
    imageUrl: 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=400&h=300&fit=crop&crop=center',
    description: (
      <>
        Built from the ground up with TypeScript decorators to provide a fully
        type-safe and modern developer experience.
      </>
    ),
  },
  {
    title: 'Powerful Module System',
    imageUrl: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=400&h=300&fit=crop&crop=center',
    description: (
      <>
        Organize your application into modules with support for both static
        and dynamic configuration, inspired by industry-leading frameworks.
      </>
    ),
  },
  {
    title: 'Developer-Friendly API',
    imageUrl: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=400&h=300&fit=crop&crop=center',
    description: (
      <>
        Designed with a clean and intuitive API that makes it easy to manage
        dependencies and build scalable applications.
      </>
    ),
  },
];

function Feature({title, imageUrl, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <img src={imageUrl} alt={title} className={styles.featureImage} />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props) => (
            <Feature key={props.title} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
