/// <reference lib="WebWorker" />
/* eslint-disable no-restricted-globals */

import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL, type PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & typeof globalThis & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

const basePath = self.location.pathname.replace(/sw\.js$/, '');
const handler = createHandlerBoundToURL(`${basePath}index.html`);
const navigationRoute = new NavigationRoute(handler);
registerRoute(navigationRoute);
