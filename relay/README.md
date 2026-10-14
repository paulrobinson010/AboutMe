# Putt. live relay

Lets other people watch a Putt. scorecard live, or score on it from
their own phones. The page at `/golf.html` encrypts the card on each
phone and sends it here; this relay passes it to everyone else in the
same room. It never sees a
score (the key is after the `#` in the watch link, which browsers never
send to a server) and it stores nothing — a room exists only in memory
while someone is connected.

A Cloudflare Worker plus one Durable Object per game, on the free plan.

## Deploy (once)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a
   repository** → pick `paulrobinson010/AboutMe`.
2. **Root directory:** `relay`. Leave the build command empty; the
   deploy command is `npx wrangler deploy`. Save and deploy.
3. In the new worker (`putt-relay`) → **Settings** → **Domains & Routes**
   → **Add** → **Custom domain** → `relay.robbo-online.uk`.

After that, pushes to `main` redeploy it. To skip that for site-only
changes: worker → **Settings** → **Build** → **Build watch paths** →
include `relay/*`.

(Or from a terminal: `cd relay && npx wrangler deploy`, sign in when the
browser opens, then add the custom domain as in step 3.)

## Settings

- `ALLOWED_ORIGINS` in `wrangler.toml`: the pages allowed to open
  rooms. Add any other address `golf.html` is served from.
- The page looks for the relay at `wss://relay.robbo-online.uk`
  (`RELAY` near the top of the script in `golf.html`).

## Try it locally

```sh
cd relay && npx wrangler dev        # relay on ws://localhost:8787
cd .. && python3 -m http.server 8903
# open http://localhost:8903/golf.html?relay=ws://localhost:8787
```
