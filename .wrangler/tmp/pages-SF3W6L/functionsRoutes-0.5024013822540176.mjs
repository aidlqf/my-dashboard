import { onRequestGet as __data_js_onRequestGet } from "/home/simon/my-dashboard/functions/data.js"

export const routes = [
    {
      routePath: "/data",
      mountPath: "/",
      method: "GET",
      middlewares: [],
      modules: [__data_js_onRequestGet],
    },
  ]