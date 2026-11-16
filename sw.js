/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  importScripts("/moto-mandados/sw-push.js");
  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "sw-push.js",
    "revision": "2810933683c4f1bb11adba445cc56b6d"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "3914f906be560010a56cae36a9a6ad3d"
  }, {
    "url": "pwa-512x512.png",
    "revision": "b51b9b5dcce3ab0808323ac815f18315"
  }, {
    "url": "pwa-192x192.png",
    "revision": "31dbdc043ae147e3c7cfe4b52df1a850"
  }, {
    "url": "index.html",
    "revision": "87dc11376120dffa83e6846e7ac09e2e"
  }, {
    "url": "icon.svg",
    "revision": "10b2ee938bead87f218a38fb86af8896"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "ca76c9162cd4de2716e0d69f9334fb4d"
  }, {
    "url": "assets/workbox-window.prod.es5-Bd17z0YL.js",
    "revision": null
  }, {
    "url": "assets/webgl-4jRJd5yU.js",
    "revision": null
  }, {
    "url": "assets/index-Cy21lv_h.css",
    "revision": null
  }, {
    "url": "assets/index-B5T2i8Pq.js",
    "revision": null
  }, {
    "url": "assets/get-attribute-from-layouts-Dd2gixpo.js",
    "revision": null
  }, {
    "url": "assets/expression-DXRI9jg6.js",
    "revision": null
  }, {
    "url": "assets/array-utils-flat-BL8Cekj1.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "ca76c9162cd4de2716e0d69f9334fb4d"
  }, {
    "url": "icon.svg",
    "revision": "10b2ee938bead87f218a38fb86af8896"
  }, {
    "url": "pwa-192x192.png",
    "revision": "31dbdc043ae147e3c7cfe4b52df1a850"
  }, {
    "url": "pwa-512x512.png",
    "revision": "b51b9b5dcce3ab0808323ac815f18315"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "3914f906be560010a56cae36a9a6ad3d"
  }, {
    "url": "sw-push.js",
    "revision": "2810933683c4f1bb11adba445cc56b6d"
  }, {
    "url": "manifest.webmanifest",
    "revision": "89c66f403b122343ad7172e18dab1c78"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
