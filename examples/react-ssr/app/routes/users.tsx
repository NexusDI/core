import { containerContext } from '../shared/container';
import { USER_SERVICE_TOKEN } from '../modules/users/user.service';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Section,
} from '../components';
import type { Route } from './+types/users';

export async function loader({ context }: Route.LoaderArgs) {
  const container = context.get(containerContext);
  const userService = container.get(USER_SERVICE_TOKEN);
  const users = await userService.getUsers();
  return { users };
}

export default function Users({ loaderData }: Route.ComponentProps) {
  const { users } = loaderData;

  return (
    <Section>
      <h2 className="text-2xl font-semibold mb-4 dark:text-white">
        User List ({users?.length || 0} users)
      </h2>

      <div className="grid gap-4">
        {users?.map((user: any) => (
          <Card key={user.id}>
            <CardHeader>
              <CardTitle>{user.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm dark:text-gray-300">
                <p>
                  <strong>ID:</strong> {user.id}
                </p>
                <p>
                  <strong>Username:</strong> {user.username}
                </p>
                <p>
                  <strong>Email:</strong> {user.email}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}
