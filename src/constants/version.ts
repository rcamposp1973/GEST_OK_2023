/** Versión de la plataforma (versionado semántico MAYOR.MENOR.PARCHE). El detalle de cada versión está en CHANGELOG.md. */
export const APP_VERSION = 'v1.2.0';
export const APP_BUILD_NAME = 'Gest_OK Corporate';

declare const __BUILD_ID__: string | undefined;
/** Código corto del despliegue (commit de Git); permite saber exactamente qué código está en uso. */
export const BUILD_ID: string = typeof __BUILD_ID__ !== 'undefined' && __BUILD_ID__ ? __BUILD_ID__ : '';
/** Ej.: "v1.1.0 · 578a157" (en desarrollo local, solo la versión). */
export const APP_VERSION_FULL = BUILD_ID ? `${APP_VERSION} · ${BUILD_ID}` : APP_VERSION;
