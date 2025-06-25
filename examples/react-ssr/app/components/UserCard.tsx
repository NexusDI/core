import { Card, CardContent, CardHeader, CardTitle } from './Card';

interface User {
  id: number;
  name: string;
  username: string;
  email: string;
}

interface UserCardProps {
  user: User;
  title: string;
}

export const UserCard = ({ user, title }: UserCardProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {user ? (
          <div className="text-sm dark:text-gray-300">
            <p>
              <strong>ID:</strong> {user.id}
            </p>
            <p>
              <strong>Name:</strong> {user.name}
            </p>
            <p>
              <strong>Username:</strong> {user.username}
            </p>
            <p>
              <strong>Email:</strong> {user.email}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No user data available.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
