import { onRequestGet as __api_crypto_js_onRequestGet } from "/home/simon/my-dashboard/functions/api/crypto.js"
import { onRequestGet as __data_js_onRequestGet } from "/home/simon/my-dashboard/functions/data.js"

export const routes = [
    {
      routePath: "/api/crypto",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_crypto_js_onRequestGet],
    },
  {
      routePath: "/data",
      mountPath: "/",
      method: "GET",
      middlewares: [],
      modules: [__data_js_onRequestGet],
    },
  ]