# The game on the owner's own domain

Everything is ready; nothing changes until the owner sets the variable. GitHub Pages at
`https://spacexceo.github.io/forget-to-foresee/` stays the default and keeps working afterwards.

## Switch (repository owner)

1. DNS at the domain's registrar: a `CNAME` record from the chosen name (for example `play.example.com`) to
   `spacexceo.github.io` (for an apex domain: the four GitHub Pages `A` records instead).
2. GitHub: Settings -> Secrets and variables -> Actions -> Variables -> New variable `FTF_DOMAIN` = `play.example.com`.
3. GitHub: Settings -> Pages -> Custom domain = the same name; tick "Enforce HTTPS" once the certificate is issued.
4. Actions -> pages -> Run workflow (a variable alone does not start a build).

The build then serves from `/` (not `/forget-to-foresee/`), the share links and the `og:` tags point to
`https://play.example.com/`, and a `CNAME` file ships with the page (`game/build/site.js`,
`.github/workflows/pages.yml`). `FTF_BASE` and `FTF_SITE_URL` override the path and the link on their own.

## Servers (merge lead)

The relayer and the presence server allow the Pages origin always, plus a comma list in `FTF_ALLOWED_ORIGINS`
(the older `ALLOWED_ORIGIN` still works): add `FTF_ALLOWED_ORIGINS=https://play.example.com` to both services' env
and restart them. The old origin keeps working, so the switch has no downtime.

## Guard

`game/tests/client/site-config.test.mjs` fails when game, relayer or presence code names the Pages host or its
sub-path anywhere but the two configuration spots.
