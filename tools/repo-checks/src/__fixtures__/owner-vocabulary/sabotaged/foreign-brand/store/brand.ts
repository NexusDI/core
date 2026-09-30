const TAG = Symbol.for('nexusdi.tag');

export const tagged = (value: object): boolean => TAG in value;

const SHARED = Symbol.for('nexusdi.shared');

export const shared = (value: object): boolean => SHARED in value;
