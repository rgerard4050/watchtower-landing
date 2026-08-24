'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const checkout = require('./api/checkout');
const config = require('./api/config');
const review = require('./api/review');
const { localDemoHandler } = require('./server/local-demo');
const PORT = Number(process.env.PORT || 4175);
const MAX_BODY = 4_200_000;

function responseAdapter(nodeResponse) {
  return {
    setHeader: (name, value) => nodeResponse.setHeader(name, value),
    status(code) {
      nodeResponse.statusCode = code;
      return this;
    },
    json(body) {
      nodeResponse.setHeader('Content-Type', 'application/json; charset=utf-8');
      nodeResponse.end(JSON.stringify(body));
      return this;
    },
  };
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('Request body exceeds local pilot limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

http.createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (pathname === '/api/checkout' || pathname === '/api/config' || pathname === '/api/review' || pathname === '/api/local-demo-review') {
    try {
      request.body = await readJson(request);
      const handler = pathname === '/api/checkout'
        ? checkout
        : pathname === '/api/config'
          ? config
        : pathname === '/api/review'
          ? review
          : localDemoHandler;
      return await handler(request, responseAdapter(response));
    } catch (error) {
      response.statusCode = 413;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      return response.end(JSON.stringify({ error: error.message, code: 'REQUEST_TOO_LARGE' }));
    }
  }
  const staticPages = new Map([
    ['/', 'index.html'],
    ['/index.html', 'index.html'],
    ['/pilot', 'pilot.html'],
    ['/pilot.html', 'pilot.html'],
  ]);
  if (!staticPages.has(pathname)) {
    response.statusCode = 404;
    return response.end('Not found');
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  return fs.createReadStream(path.join(__dirname, staticPages.get(pathname))).pipe(response);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Morrow Submittal Intelligence: http://localhost:${PORT}`);
});
