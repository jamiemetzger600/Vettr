/**
 * Call an existing Express handler and capture res.json / res.send.
 */
export function runHandler(handler, { user, query = {}, params = {}, body = {} } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Handler timed out'));
    }, 25000);

    const req = {
      user,
      query,
      params,
      body,
      headers: {},
      cookies: {},
      authSource: 'mcp',
      get(name) {
        const key = String(name || '').toLowerCase();
        return this.headers[key] ?? this.headers[name];
      }
    };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader() {
        return this;
      },
      set() {
        return this;
      },
      end() {
        finish({ status: this.statusCode, body: null });
      },
      json(payload) {
        finish({ status: this.statusCode, body: payload });
      },
      send(payload) {
        finish({ status: this.statusCode, body: payload });
      }
    };

    Promise.resolve(handler(req, res))
      .then(() => {
        if (!settled) finish({ status: res.statusCode, body: null });
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
  });
}
