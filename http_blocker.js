'use strict';
 
const http = require('http');
const https = require('https');
const net = require('net');
const { URL } = require('url');
 
// local only, dont expose this to the network
const PORT = 8001;
const HOST = '127.0.0.1';
 
/*
  BLOCKLIST
  Add domains without protocols, paths, or ports.
  subdomains get blocked automaticaly too
*/
const BLOCKED = new Set([
  'popup'
]);
 
// strips a url/host string down to just the bare hostname
function normalizeHost(value = '') {
  let host = String(value).trim().toLowerCase();
 
  // Remove scheme, path, query, fragment, and port.
  host = host.replace(/^[a-z][a-z\d+.-]*:\/\//, '');
  host = host.split(/[/?#]/, 1)[0];
  host = host.replace(/^\[|\]$/g, '');
  host = host.replace(/:\d+$/, '');
  host = host.replace(/\.+$/, '');
 
  return host;
}
 
// exact match or any subdomain of a blocked entry
function isBlocked(value) {
  const host = normalizeHost(value);
 
  return [...BLOCKED].some(domain => {
    domain = normalizeHost(domain);
    return host === domain || host.endsWith(`.${domain}`);
  });
}
 
// raw 403 for CONNECT tunnels (no http response object there)
function blockedResponse(socket) {
  socket.end(
    'HTTP/1.1 403 Forbidden\r\n' +
    'Connection: close\r\n' +
    'Content-Type: text/plain\r\n' +
    'Content-Length: 25\r\n\r\n' +
    'Blocked by network policy'
  );
}
 
function destroyQuietly(socket) {
  if (socket && !socket.destroyed) socket.destroy();
}
 
const server = http.createServer((clientReq, clientRes) => {
  let target;
 
  try {
    // Browser proxy requests normally contain an absolute URL.
    target = new URL(clientReq.url);
  } catch {
    clientRes.writeHead(400);
    return clientRes.end('Invalid proxy request');
  }
 
  const hostname = normalizeHost(target.hostname);
 
  if (isBlocked(hostname)) {
    console.log(`[BLOCKED] ${hostname}`);
    clientRes.writeHead(403, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store',
      'Connection': 'close'
    });
    return clientRes.end('Blocked by network policy');
  }
 
  const transport = target.protocol === 'https:' ? https : http;
  const headers = { ...clientReq.headers };
 
  // these are hop-by-hop headers so we dont forward them
  delete headers.connection;
  delete headers['proxy-connection'];
  delete headers['proxy-authorization'];
 
  const upstream = transport.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    method: clientReq.method,
    path: `${target.pathname}${target.search}`,
    headers
  }, upstreamRes => {
    clientRes.writeHead(upstreamRes.statusCode, upstreamRes.headers);
    upstreamRes.pipe(clientRes);
  });
 
  // kill slow upstreams after 30s so connections dont pile up
  upstream.setTimeout(30000, () => upstream.destroy());
 
  upstream.on('error', err => {
    console.error(`[UPSTREAM] ${hostname}: ${err.message}`);
    destroyQuietly(clientRes);
  });
 
  clientReq.on('error', () => upstream.destroy());
  clientRes.on('error', () => upstream.destroy());
 
  clientReq.pipe(upstream);
});
 
// Handles HTTPS and WebSocket CONNECT requests.
server.on('connect', (request, clientSocket) => {
  // request.url looks like "example.com:443"
  const separator = request.url.lastIndexOf(':');
  const hostname = normalizeHost(
    separator > 0 ? request.url.slice(0, separator) : request.url
  );
  const port = separator > 0
    ? Number(request.url.slice(separator + 1))
    : 443;
 
  if (isBlocked(hostname)) {
    console.log(`[BLOCKED CONNECT] ${hostname}`);
    return blockedResponse(clientSocket);
  }
 
  // sanity check the port before we try to connect
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return destroyQuietly(clientSocket);
  }
 
  const upstreamSocket = net.connect({ host: hostname, port });
 
  clientSocket.on('error', () => destroyQuietly(upstreamSocket));
  upstreamSocket.on('error', err => {
    console.error(`[CONNECT] ${hostname}: ${err.message}`);
    destroyQuietly(clientSocket);
  });
 
  upstreamSocket.on('connect', () => {
    // client may have given up while we were connecting
    if (clientSocket.destroyed) {
      return destroyQuietly(upstreamSocket);
    }
 
    clientSocket.write(
      'HTTP/1.1 200 Connection Established\r\n' +
      'Connection: keep-alive\r\n\r\n'
    );
 
    // from here on its just raw bytes both ways, we cant see inside the tls
    clientSocket.pipe(upstreamSocket);
    upstreamSocket.pipe(clientSocket);
  });
 
  clientSocket.on('close', () => destroyQuietly(upstreamSocket));
  upstreamSocket.on('close', () => destroyQuietly(clientSocket));
});
 
server.on('clientError', (_error, socket) => {
  destroyQuietly(socket);
});
 
server.listen(PORT, HOST, () => {
  console.log(`Filtering proxy listening on http://${HOST}:${PORT}`);
  console.log(`Blocked domains: ${[...BLOCKED].join(', ') || '(none)'}`);
});
 
