==========================================
  http_blocker
==========================================

DESCRIPTION
-----------
A lightweight local filtering proxy written in Node.js. It blocks every
domain on a user-defined blocklist (including all of their subdomains) for
any browser or app that is configured to use it as its proxy.

Blocked HTTP requests and HTTPS (CONNECT) tunnels get a "403 Forbidden"
response. Everything else is passed straight through to its destination.


REQUIREMENTS
------------
- Node.js (any recent version)
- No extra packages needed, it only uses built-in Node modules


HOW TO RUN
----------
From inside the project directory:

    node http_blocker.js

You should see:

    Filtering proxy listening on http://127.0.0.1:8001
    Blocked domains: popup

Leave that terminal open while you want the blocker active.
Press Ctrl+C to stop it.


SETTING UP YOUR BROWSER
-----------------------
Set your browser (or system) proxy to:

    Address:  127.0.0.1  (or localhost)
    Port:     8001

Use this for both HTTP and HTTPS. The blocker only works for traffic that
goes through the proxy, so if the proxy is not set, nothing is blocked.


EDITING THE BLOCKLIST
---------------------
Open http_blocker.js and find the BLOCKED list near the top:

    const BLOCKED = new Set([
      'popup'
    ]);

Add domains as plain hostnames, one per line, with commas between them.
No protocol, path, or port:

    const BLOCKED = new Set([
      'ads.example.com',
      'tracker.example.net'
    ]);

Blocking a domain also blocks its subdomains.
Example: 'example.com' also blocks 'cdn.example.com'.

Restart the program after changing the list.


CHANGING THE PORT
-----------------
The port is set at the top of http_blocker.js:

    const PORT = 8001;

Change it to any free port, restart, and update your browser's proxy
settings to match.


NOTES
-----
- The proxy listens on 127.0.0.1 only, so it is not reachable from other
  devices on your network.
- HTTPS traffic is tunneled, not decrypted. Blocking works by domain name
  only, not by page or URL path.
- Blocked requests are logged to the terminal as [BLOCKED].
