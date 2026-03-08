/**
 * router.js – Minimal HTTP router for Node.js http.Server.
 *
 * Usage:
 *   const router = new Router();
 *   router.get('/api/foo', handler);
 *   router.post('/api/bar/:id', handler);
 *   router.use(staticMiddleware);
 *   http.createServer((req, res) => router.handle(req, res)).listen(3000);
 *
 * Route handlers receive (req, res, params) where params is an object of
 * named path parameters extracted from the route pattern.
 */

export class Router {
  constructor() {
    this._routes = [];      // { method, pattern, keys, handler }
    this._middleware = [];  // (req, res, next) => void
  }

  /** Register a route for the given HTTP method. */
  on(method, path, handler) {
    const { pattern, keys } = _compile(path);
    this._routes.push({ method: method.toUpperCase(), pattern, keys, handler });
    return this;
  }

  get(path, handler)    { return this.on('GET',    path, handler); }
  post(path, handler)   { return this.on('POST',   path, handler); }
  put(path, handler)    { return this.on('PUT',    path, handler); }
  patch(path, handler)  { return this.on('PATCH',  path, handler); }
  delete(path, handler) { return this.on('DELETE', path, handler); }

  /** Register a middleware (runs before route matching). */
  use(fn) {
    this._middleware.push(fn);
    return this;
  }

  /**
   * Main request handler – pass to http.createServer().
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse}  res
   */
  handle(req, res) {
    // Run middleware chain
    let midIdx = 0;
    const next = () => {
      if (midIdx < this._middleware.length) {
        this._middleware[midIdx++](req, res, next);
      } else {
        this._dispatch(req, res);
      }
    };
    next();
  }

  _dispatch(req, res) {
    const urlPath = req.url.split('?')[0];
    const method  = req.method.toUpperCase();

    for (const route of this._routes) {
      if (route.method !== method && route.method !== '*') continue;
      const match = route.pattern.exec(urlPath);
      if (!match) continue;

      const params = {};
      route.keys.forEach((k, i) => { params[k] = decodeURIComponent(match[i + 1]); });
      req.params = params;

      try {
        route.handler(req, res, params);
      } catch (err) {
        console.error('[router] Unhandled error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
      return;
    }

    // No route matched
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

// ---------------------------------------------------------------------------

function _compile(path) {
  const keys = [];
  const src = path
    .replace(/\/:[^/]+/g, (seg) => {
      keys.push(seg.slice(2));
      return '/([^/]+)';
    })
    .replace(/\*/g, '.*');
  return { pattern: new RegExp(`^${src}$`), keys };
}

// ---------------------------------------------------------------------------
// Helpers for route handlers
// ---------------------------------------------------------------------------

/** Parse a JSON request body, returning a Promise<object>. */
export function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf-8');
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

/** Send a JSON response. */
export function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type':  'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** Parse query string parameters from req.url. */
export function parseQuery(req) {
  const idx = req.url.indexOf('?');
  if (idx === -1) return {};
  return Object.fromEntries(new URLSearchParams(req.url.slice(idx + 1)));
}
