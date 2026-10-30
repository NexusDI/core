import { Form } from 'react-router';

import { Button } from '../../components';
import { ToggleForm } from './system-page';

/**
 * The airlock's pump mode select and its vent buttons. Each form posts a
 * life-support command for the airlock, and the page that renders them
 * routes it to that system. `pump` is the mode the select starts at.
 */
export function AirlockControls({ pump }: { pump: string }) {
  return (
    <>
      <Form method="post" className="flex gap-2 items-center mb-4">
        <input type="hidden" name="command" value="pump" />
        <input type="hidden" name="compartment" value="airlock" />
        <label htmlFor="mode">Airlock pump mode</label>
        <select id="mode" name="mode" defaultValue={pump}>
          <option value="off">off</option>
          <option value="evacuate">evacuate</option>
          <option value="fill">fill</option>
        </select>
        <Button type="submit">Set pump</Button>
      </Form>
      <ToggleForm
        command="vent"
        field="open"
        on="Open vent"
        off="Shut vent"
        hidden={{ compartment: 'airlock' }}
      />
    </>
  );
}
