/**
 * The star select of the helm and FTL pages. It lives apart from the shared
 * page components because it reads the bundled charts, and only these two
 * pages need them.
 */
import { BUNDLED_CHARTS } from '@nexusdi/meridian-systems/charts';
import { Form } from 'react-router';

import { Button } from '../../components';

/**
 * A form of a select named `to` that lists the charted stars, with one button
 * that posts `command` for the star the reader picks.
 */
export function StarSelect({
  command,
  button,
}: {
  command: string;
  button: string;
}) {
  const stars = Object.keys(BUNDLED_CHARTS);
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
