// Web: go through our same-origin proxy, which adds the official Origin header.
import { createEdtClient } from './edt-core';

export * from './edt-core';
export const edt = createEdtClient('/api/edt');
