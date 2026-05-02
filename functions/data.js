// Backward-compatible route: /data
// The React app now calls /api/crypto, but this route is kept so old links still return JSON.
export { onRequestGet } from "./api/crypto.js";
