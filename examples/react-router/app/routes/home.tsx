import { getContainer } from '../shared/container';
import { LOGGER_SERVICE_TOKEN } from '../modules/logger/logger.service';
import { USER_SERVICE_TOKEN } from '../modules/users/user.service';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Section,
  UserCard,
} from '../components';
import type { Route } from './+types/home';
import { data, Form } from 'react-router';

let user: any = null;

export async function loader({ context }: Route.LoaderArgs) {
  const container = getContainer(context);
  const hasUserService = container.has(USER_SERVICE_TOKEN);
  const hasLoggerService = container.has(LOGGER_SERVICE_TOKEN);

  const logger = container.get(LOGGER_SERVICE_TOKEN);
  logger.info('Home page loaded');

  return {
    hasUserService,
    hasLoggerService,
    user,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get('intent');
  const container = getContainer(context);
  const logger = container.get(LOGGER_SERVICE_TOKEN);
  const userService = container.get(USER_SERVICE_TOKEN);

  switch (intent) {
    case 'logMessage': {
      logger.info('Button clicked: Log a Message');
      return { message: 'Logged a message to the console.' };
    }
    case 'createUser': {
      const users = await userService.getUsers();
      user = users[0] || null;
      logger.info('Button clicked: Create a User', { userId: user?.id });
      return { message: `User "${user?.name}" created.` };
    }
    case 'reset': {
      user = null;
      logger.info('Button clicked: Reset');
      return { message: 'Data has been reset.' };
    }
    default: {
      return data({ message: 'Unknown intent' }, { status: 400 });
    }
  }
}

export default function Home({loaderData, actionData}:Route.ComponentProps) {
  const { hasUserService, hasLoggerService, user } = loaderData;

  const statusColor = (status: boolean) =>
    status ? 'text-green-500' : 'text-red-500';

  return (
    <>
      {actionData?.message && (
        <div
          className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mb-6"
          role="alert"
        >
          <p className="font-bold">Information</p>
          <p>{actionData.message}</p>
        </div>
      )}

      <Section>
        <h2 className="text-2xl font-semibold mb-4 dark:text-white">
          Container Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>User Service</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={statusColor(hasUserService)}>
                {hasUserService ? 'Registered' : 'Not Registered'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Logger Service</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={statusColor(hasLoggerService)}>
                {hasLoggerService ? 'Registered' : 'Not Registered'}
              </p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section>
        <h2 className="text-2xl font-semibold mb-4 dark:text-white">
          Interactive Features
        </h2>
        <div className="flex flex-wrap gap-4">
          <Form method="post">
            <input type="hidden" name="intent" value="logMessage" />
            <Button
              type="submit"
              variant="default"
              className="dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              Log a Message
            </Button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="createUser" />
            <Button
              type="submit"
              variant="green"
              className="dark:bg-green-600 dark:hover:bg-green-700"
            >
              Create a User
            </Button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="reset" />
            <Button
              type="submit"
              variant="destructive"
              className="dark:bg-red-600 dark:hover:bg-red-700"
            >
              Reset
            </Button>
          </Form>
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Section>
          <UserCard user={user} title="Sample Data" />
        </Section>

        <Section>
          <h2 className="text-2xl font-semibold mb-4 dark:text-white">
            Explore Features
          </h2>
          <div className="flex flex-col gap-4">
            <Button as="link" to="/users" variant="outline">
              View Users Page
            </Button>
            <Button
              as="link"
              to="/non-existent"
              variant="outline"
              className="text-purple-500 border-purple-500 hover:bg-purple-100 dark:text-purple-400 dark:border-purple-400 dark:hover:bg-purple-900"
            >
              Test 404 Page
            </Button>
          </div>
        </Section>
      </div>
    </>
  );
}
