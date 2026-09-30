const ERROR = Symbol.for('nexusdi.error');

export const isError = (value: object): boolean => ERROR in value;

export const brandOf = (name: string): symbol => Symbol.for(`nexusdi.${name}`);

export const lookup = Symbol.for;

export const TAG = Symbol.for('nexusdi.tag');

const SHARED = Symbol.for('nexusdi.shared');

export const shared = (value: object): boolean => SHARED in value;
