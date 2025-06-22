import React from 'react';
import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import CodeExample from '@site/src/components/CodeExample';

import styles from './index.module.css';

const exampleCode = `
import { Nexus, Service, Token } from '@nexusdi/core';

// 1. Define an interface and a token
interface IGreeter {
  greet(): string;
}
const GreeterToken = new Token<IGreeter>('Greeter');

// 2. Create a service
@Service(GreeterToken)
class GreeterService implements IGreeter {
  greet() {
    return 'Hello from NexusDI!';
  }
}

// 3. Create a container and get the service
const container = new Nexus();
container.register(GreeterService);

const greeter = container.get(GreeterToken);
console.log(greeter.greet()); // Output: Hello from NexusDI!
`.trim();

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroContent}>
          <div className={styles.heroLeft}>
            <div className={styles.heroLogoContainer}>
              <img src="/img/logo-white.svg" alt="NexusDI Logo" className={styles.heroLogo} />
              <h1 className={clsx('hero__title', styles.heroTitle)}>{siteConfig.title}</h1>
              <p className={clsx('hero__subtitle', styles.heroSubtitle)}>{siteConfig.tagline}</p>
            </div>
            
            <div className={styles.buttons}>
              <Link
                className="button button--secondary button--lg"
                to="/docs/intro">
                Get Started
              </Link>
              <Link
                className="button button--outline button--lg"
                to="/docs/getting-started">
                View Documentation
              </Link>
            </div>
          </div>
          
          <div className={styles.heroRight}>
            <div className={styles.codeExample}>
              <CodeBlock language="typescript" className={styles.codeExample}>
{exampleCode}
              </CodeBlock>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`Hello from ${siteConfig.title}`}
      description="Description will go into a meta tag in <head />">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
