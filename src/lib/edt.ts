// Native: call edt-api directly. Unlike browsers, iOS/Android let us set Origin.
import { API_BASE, createEdtClient, OFFICIAL_ORIGIN_HEADERS } from './edt-core';

export * from './edt-core';
export const edt = createEdtClient(API_BASE, OFFICIAL_ORIGIN_HEADERS);
