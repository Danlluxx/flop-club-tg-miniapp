# FLOP Club edge endpoint

This Worker provides a stable `workers.dev` address and reaches the production
Docker stack through a Cloudflare Tunnel VPC binding. It routes directly to the
`web`, `api`, and `blind-clock` services and does not depend on the server's
public TCP ports.

## One-time setup

1. Rotate the tunnel token that was previously exposed and put the new value in
   the server's `.env.production` as `CLOUDFLARE_TUNNEL_TOKEN`.
2. Deploy the production Compose stack so `cloudflared` joins the same Docker
   network as `caddy` and can resolve `http://caddy:8080`.
3. Authenticate Wrangler with the Cloudflare account that owns tunnel
   `flop-club-production`:

   ```sh
   cd infra/cloudflare-worker
   npm install
   npx wrangler login
   npm run deploy
   ```

4. Set the resulting `https://flop-club-app.<account>.workers.dev` URL as
   `FRONTEND_URL` on the server and keep the previous address in
   `ADDITIONAL_FRONTEND_URLS` during the transition.
5. Rebuild `api` and `web`, then update Telegram's menu button and send a fresh
   inline application button.

## Verification

The response should include `x-flop-edge: workers-vpc`:

```sh
curl -fsS -D - https://flop-club-app.<account>.workers.dev/health
```
