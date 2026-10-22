import { Form } from 'react-router';

import { Button } from '../../components';

/**
 * The airlock's pump mode select and its vent buttons. Each form posts a
 * life-support command for the airlock, and the page that renders them
 * routes it to that system.
 */
export function AirlockControls() {
  return (
    <>
      <Form method="post" className="flex gap-2 items-center mb-4">
        <input type="hidden" name="command" value="pump" />
        <input type="hidden" name="compartment" value="airlock" />
        <label htmlFor="mode">Airlock pump mode</label>
        <select id="mode" name="mode" defaultValue="off">
          <option value="off">off</option>
          <option value="evacuate">evacuate</option>
          <option value="fill">fill</option>
        </select>
        <Button type="submit">Set pump</Button>
      </Form>
      <Form method="post" className="flex gap-2">
        <input type="hidden" name="command" value="vent" />
        <input type="hidden" name="compartment" value="airlock" />
        <Button type="submit" name="open" value="true">
          Open vent
        </Button>
        <Button type="submit" name="open" value="false" variant="outline">
          Shut vent
        </Button>
      </Form>
    </>
  );
}
