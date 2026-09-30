import { NexusError } from '@nexusdi/core';

// A check hook that reports one error, so a test can tell the plugin ran.
export const plugins = [
  {
    name: 'fixture:check',
    apiVersion: 1,
    compile: {
      check(_view, report) {
        report(
          new NexusError(
            'FIXTURE_LINT',
            'FixtureLint',
            {},
            {
              text: 'the fixture check hook ran',
            },
          ),
        );
      },
    },
  },
];
export const notArray = { name: 'fixture:check', apiVersion: 1 };
