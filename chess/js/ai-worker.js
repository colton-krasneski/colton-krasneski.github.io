/* The computer player thinks in here, off the page's own thread, so the
   board stays smooth while it does. One question in, one answer out. */
import { think } from './ai.js';

self.onmessage = e => {
  const { id, payload } = e.data;
  let result = null;
  try { result = think(payload); } catch (err) { result = null; }
  self.postMessage({ id, result });
};
