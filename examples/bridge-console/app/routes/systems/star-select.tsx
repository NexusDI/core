import { NAV_CHARTS } from '@nexusdi/meridian-systems/charts';
import { useService } from '@nexusdi/react';
import { Form } from 'react-router';

import { Button } from '../../components';

/**
 * A form of a select named `to` that lists the stars the charts hold, with
 * one button that posts `command` for the star the reader picks.
 */
export function StarSelect({
  command,
  button,
}: {
  command: string;
  button: string;
}) {
  const stars = useService(NAV_CHARTS).stars();
  return (
    <Form method="post" className="flex gap-2 items-center">
      <label htmlFor="to">Star</label>
      <select id="to" name="to" defaultValue={stars[0]}>
        {stars.map((star) => (
          <option key={star} value={star}>
            {star}
          </option>
        ))}
      </select>
      <Button type="submit" name="command" value={command}>
        {button}
      </Button>
    </Form>
  );
}
