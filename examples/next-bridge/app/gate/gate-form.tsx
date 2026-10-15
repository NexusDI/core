'use client';

import { useActionState } from 'react';

import { recordEntry } from '../actions';

export function GateForm() {
  // The permalink makes the form post to /gate without JavaScript, with
  // the $ACTION_ID_ field the gate test reads.
  const [entries, action] = useActionState(recordEntry, '', '/gate');
  return (
    <form action={action}>
      <input name="entry" defaultValue="docked" />
      <button type="submit">Record</button>
      <pre>{entries}</pre>
    </form>
  );
}
