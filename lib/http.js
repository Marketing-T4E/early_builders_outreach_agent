'use strict';
// fetch con timeout y reintento simple ante 429/5xx. Node >= 20 trae fetch global.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, opts = {}, { retries = 3, timeoutMs = 20000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} en ${new URL(url).host}`);
        const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * (attempt + 1);
        await sleep(Math.min(wait, 15000));
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} en ${new URL(url).host}: ${body.slice(0, 200)}`);
      }
      return await res.json();
    } catch (e) {
      if (e.cause?.code) e.message = `${e.message} (${e.cause.code})`;
      lastErr = e;
      // Reintenta: timeout, error de red (TypeError: fetch failed) o 429/5xx
      if (e.name !== 'AbortError' && e.name !== 'TypeError' && !/HTTP (429|5\d\d)/.test(e.message)) throw e;
      await sleep(1500 * (attempt + 1));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

module.exports = { fetchJson, sleep };
