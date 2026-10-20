# Newton users

A login-protected community map and live timeline built with Angular 21,
Lucidkit, NestJS, and PostgreSQL. The NestJS process serves the frontend and is
the only component with database access.

## Run with Docker

```sh
cp .env.example .env
# Edit .env to configure Discord and your public URL.
docker compose up --build -d
```

Open <http://localhost:3000>. Without Discord configuration the application shows
the welcome/setup screen; private API endpoints remain protected. No development
authentication bypass or sample accounts are installed.

In the Discord Developer Portal:

1. Create an application and configure its OAuth client ID and secret.
2. Register `http://localhost:3000/api/auth/discord/callback` as a redirect URI
   (use your HTTPS public URL in production).
3. Set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.
4. Anyone with a Discord account can sign in. Discord is used only for identity:
   login requests the `identify` scope, not email or access to server memberships.

Sessions last 12 hours. To immediately revoke an existing member's sessions, delete their
database sessions. No Discord access or refresh tokens are stored. Cookie
session tokens are cryptographically random and only their hashes are stored.
Writes require an origin check and a per-session CSRF token.

For production, use `NODE_ENV=production`, an HTTPS `PUBLIC_URL`, a strong database
password, and a TLS reverse proxy. The application binds to loopback by default;
set `BIND_ADDRESS` only when deliberately exposing it. Do not log request bodies,
OAuth callback query strings, cookies, or location form payloads at the proxy.
Disable proxy buffering for `/api/posts/events` and allow long-lived requests.

## Include in a reverse-proxy deployment

Use [compose.production.yaml](./compose.production.yaml) with Docker Compose
**2.20 or newer** (`include` support). It publishes no application or database
ports and always runs the backend in production mode. The app joins the parent
project's `default` network; PostgreSQL joins only a separate internal network.
Your Nginx Proxy Manager container must also join that default network.

For example, put this parent `compose.yaml` alongside a checkout named `UsersMap`:

```yaml
name: community

include:
  - ./UsersMap/compose.production.yaml

services:
  proxy:
    image: jc21/nginx-proxy-manager:2
    ports:
      - "80:80"
      - "443:443"
      - "127.0.0.1:81:81"
    volumes:
      - proxy-data:/data
      - proxy-certificates:/etc/letsencrypt
    networks:
      - default
    restart: unless-stopped

networks:
  default:
    name: community-proxy

volumes:
  proxy-data:
  proxy-certificates:
```

If you already have a named/external proxy network, assign it to the parent's
`default` network instead:

```yaml
networks:
  default:
    external: true
    name: your-existing-proxy-network
```

Keep the app's shared network internet-connected: Discord login, avatar import,
and other outbound requests need internet access. Only the database network
should be internal.

Copy this project's [.env.example](./.env.example) to the **parent's** `.env`,
then set:

```dotenv
PUBLIC_URL=https://newton.example.com
POSTGRES_PASSWORD=replace-with-a-long-random-hex-password
DISCORD_CLIENT_ID=your-client-id
DISCORD_CLIENT_SECRET=your-client-secret
```

Use an origin without a path or trailing slash for `PUBLIC_URL`. Generate a
URL-safe database password, for example with `openssl rand -hex 32`; this
password is interpolated into a PostgreSQL URL. Do not use the example password.
The parent's `.env` supplies the interpolation values and overrides defaults in
the included project's `.env`; exported shell variables take precedence. Build and mount paths in the included
file resolve relative to this project's directory, not the parent directory.

From the parent directory:

```sh
docker compose config --quiet
docker compose up --build -d
```

The default production image is `theredhead/usersmap:latest`.
For deployment, use `docker compose pull newton-users` followed by
`docker compose up --no-build -d`. Set `USERSMAP_IMAGE` to a specific published
version for repeatable deployments. To build your own image instead, use
`docker compose build newton-users`. Production uses the default profile form
bundled in the image; no host profile file or source checkout is required when
deploying a prebuilt image.

To customize the form, add this service override to the parent Compose file
alongside its `include` (not inside the included file):

```yaml
services:
  newton-users:
    volumes:
      - type: bind
        source: ./config/profile-form.json
        target: /app/config/profile-form.json
        read_only: true
        bind:
          create_host_path: false
```

Create a valid Lucidkit form JSON file at that path first. The source resolves
relative to the parent Compose file. `create_host_path: false` prevents Docker
from silently creating a directory when the file is missing.

### Nginx Proxy Manager

Create a Proxy Host with:

| Field | Value |
| --- | --- |
| Domain Names | Your hostname, e.g. `newton.example.com` |
| Scheme | `http` (TLS terminates at the proxy) |
| Forward Hostname / IP | `newton-users` |
| Forward Port | `3000` |
| Cache Assets | Off |
| SSL | Request/select a certificate and enable Force SSL |

Use the Advanced configuration to accommodate uploads and live updates:

```nginx
client_max_body_size 26m;
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 1h;
proxy_send_timeout 1h;
```

The body-size limit must exceed `MAXIMUM_UPLOAD_BYTES` plus multipart overhead;
`26m` accommodates the default 25,000,000-byte limit. Keep NPM's normal Host and
forwarded headers. SSE uses regular HTTP streaming; WebSocket support is not
required. Do not enable caching for authenticated API/media responses.

Register `https://newton.example.com/api/auth/discord/callback` in Discord,
point DNS at the proxy, and ensure ports 80/443 reach it. Secure cookies are
issued based on production configuration; the backend-to-proxy HTTP connection
does not require enabling blanket trust of forwarded headers.

The NPM admin port above is loopback-only. Manage it locally or through an SSH
tunnel rather than exposing it publicly. Persist and back up both proxy volumes
and the included `newton-users-data` database volume. Production uses a separate
volume from the standalone local Compose setup; it does not automatically
import local accounts or uploads.

## What is included

- Desktop: resizable Lucidkit split container with map and timeline.
- Mobile: Lucidkit map/community tabs, preserving viewport, timeline scroll,
  and composer draft while switching.
- Avatar map markers, overlap groups, uncertainty circles, whole-card profile
  navigation, outside-click/Escape dismissal, keyboard map controls, touch pan.
- Discord onboarding, rich-text bios, partial private birth dates, square
  avatar validation (maximum 512 × 512), and nickname fallback avatars.
- Profile biographies use a wrapping toolbar limited to undo/redo, inline
  formatting, lists, and alignment. Image/table/link insertion,
  template blocks, emoji, source editing, and fullscreen controls are hidden.
- Timeline posting opens in a compact Lucidkit dialog, leaving the timeline
  available for reading. Closing the dialog preserves an unpublished draft.
  Its circular close button extends one-third of its diameter past the
  top-right corner and remains reachable while the form body scrolls.
- Posts can share an optional HTTPS video link (YouTube, Vimeo, or another
  platform), with or without message text. Links appear as external cards;
  no remote thumbnails, players, or metadata are fetched automatically.
  Image and video uploads remain optional, with a responsive drop area.
- Choosing a location by map or GPS immediately centers the selection and fits
  its privacy-radius preview. A Lucidkit form slider updates the preview live,
  displaying kilometers or miles according to the member's preference without
  rounding the stored kilometer value. Saving still stores only the
  server-calculated coarse area, never the exact point.
- Deployment-defined Lucidkit profile forms, validated on both client and server.
- Optional GPS or map-selected check-in/home/work areas, explicit save actions,
  preferred distance units, and location removal.
- Newest-first timeline, 250 Unicode code-point messages, optional image/video,
  transactional rate limiting (one post/minute by default), and PostgreSQL-backed
  SSE notifications with REST catch-up after reconnect.
- Account deletion: profiles, locations, avatars, custom answers, sessions, and
  Discord identifiers are deleted. Public community posts and attachments remain
  with a null author, rendered as **Deleted user**.
- PostgreSQL bytea media storage; the database volume persists both records and
  uploads. Images are re-encoded without metadata. Videos are transcoded to MP4
  without source metadata, chapters, or extra streams. Playback supports ranges.

There is no direct messaging feature in this version.

## Configuration

See [compose.yaml](./compose.yaml) and [.env.example](./.env.example).

| Setting | Default |
| --- | --- |
| `SITE_NAME` | `Newton users` |
| `PUBLIC_URL` | `http://localhost:3000` |
| `POST_INTERVAL_SECONDS` | `60` |
| `LOCATION_MINIMUM_KM` | `1` |
| `LOCATION_DEFAULT_KM` | `5` |
| `LOCATION_MAXIMUM_KM` | `25` |
| `MAXIMUM_UPLOAD_BYTES` | `25000000` |
| `MAXIMUM_VIDEO_SECONDS` | `60` |
| `THEME_PRIMARY` | `#b2d279` |
| `THEME_SURFACE` | `#182a21` |
| `THEME_BACKGROUND` | `#101c16` |
| `THEME_TEXT` | `#e4ecd8` |

Limits are validated at startup; minimum radius cannot be configured below 1 km.
Both unit systems use the same canonical kilometer bounds (1 km ≈ 0.62 miles).
Videos exceeding the configured duration or processed-size limit are rejected,
not silently truncated. Local development requires `ffmpeg` and `ffprobe`.

### Themes

The global stylesheet includes the `lucid-theme` generated theme. Deployment
colors are fetched from `/api/configuration` and applied as Lucid Theme semantic
CSS tokens before the application renders. Components and application surfaces
use those tokens rather than independent hard-coded palettes. Colors must be
six-digit hex values. Restart the deployment after changing environment values.

### Custom profiles

Edit [config/profile-form.json](./config/profile-form.json), mounted read-only
in local Compose. Production uses the bundled form unless you add the explicit
custom-form mount described above. Recreate the app after changing the form.
Use stable, unique field IDs and increment the schema ID when
changing its meaning. Supported deployment fields are text, checkbox, select,
radio, and slider, with required/length/range/pattern validation. Deployment
schemas are trusted administrator configuration, not member input.

New optional fields need no database migration. Answers are stored in JSONB with
the submitted schema ID. Existing answers for removed fields are dropped when
the member next saves; renaming IDs or changing field types requires an explicit
data migration before deployment. Built-in profile field IDs are reserved.

The test hardware catalogue covers Apple's released MessagePads and eMate,
Sharp ExpertPads, Motorola Marco, Digital Ocean Tarpon/Seahorse, Siemens
NotePhone, and Harris SuperTech 2000. Sources:
[Newton hardware overview](https://en.wikipedia.org/wiki/Apple_Newton#Hardware)
and [Smithsonian NotePhone collection](https://americanhistory.si.edu/collections/object/nmah_1191463).
MessagePad 100 is listed separately as a released product even though its
hardware is the same as the original MessagePad.

### Localization

[feature-intl.ts](./apps/web/src/app/core/feature-intl.ts) establishes namesake
feature interfaces, English injectable implementations, and typed injection
tokens with `en-US` date/distance formatting. The checked-in Lucidkit version
does not yet export the proposed `Language` decorator/culture resolver, so this
application does not pretend that API exists.

**Remaining localization work:** move the remaining English screen copy and
form/error messages into their feature Intl contracts before adding another
language. Runtime culture switching is not implemented.

## Privacy and data lifecycle

Exact GPS/map coordinates are used transiently to compute a deterministic coarse
geographic cell. Only its center, declared radius, current comment, and current
timestamp are persisted. The frontend never silently submits browser GPS.
There is no address field, reverse geocoder, or application location history.
There is one row per member/location kind; a check-in replaces its previous row.
Map precedence is check-in, then home, then work. Check-in comments are not
automatically copied into permanent timeline posts.

The radius is an approximate geographic uncertainty/displacement bound, not a
formal anonymity guarantee. A sparse area, voluntarily identifying text/media,
or repeated observations can still identify someone. Map tiles are fetched
directly from the configured tile provider, which receives visitors' IPs and
tile requests; self-host tiles if that is unsuitable. Respect OpenStreetMap's
[tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
The default service is suitable for modest interactive use, not bulk/offline
downloads. Use a production tile provider for larger deployments.

Birth dates are private to the account owner. Public community content is visible
only to authenticated members, not unauthenticated visitors. Uploaded post
content can itself contain personal details: deleting an account does not edit
retained post text or media.

Account deletion applies to the live database. PostgreSQL WAL and existing
backups may contain earlier data until retention expires; operators must define
backup retention and prevent deleted accounts reappearing after restore.
Unattached uploads can be removed by their owner through `DELETE /api/media/:id`;
production deployments should schedule cleanup of old unattached post media.

## Development

Node 24 and npm are supported. Local Lucidkit 0.2.1 packages are packed under
[vendor/](./vendor/) so a clean Docker build does not rely on a sibling checkout.
Their MIT license notice is included in [vendor/LUCIDKIT-LICENSE](./vendor/LUCIDKIT-LICENSE).

Angular components always keep TypeScript, HTML templates, and styles in separate
files named `<name>.component.ts`, `<name>.component.html`, and
`<name>.component.scss` (tests use `<name>.component.spec.ts`).
Use `templateUrl` and, when styles exist, `styleUrl` or `styleUrls`.
Do not create empty stylesheets. ESLint rejects inline templates and styles.

```sh
npm ci
docker compose -f compose.test.yaml up -d --wait
export DATABASE_URL=postgres://newton:newton-test-only@127.0.0.1:55439/newton_test
export PUBLIC_URL=http://localhost:4200
npm run dev
```

Frontend: <http://localhost:4200>; API: <http://localhost:3000>.
Stop the standard Compose app first if port 3000 is already in use, or set a
different API port and update the development proxy. Configure the Discord
redirect for port 4200 during development. Environment files are consumed by
Docker Compose; shell-based development uses exported environment variables.

Database migrations run under an advisory transaction lock at startup.
All query values are parameterized; schema changes live under
[migrations/](./apps/api/src/database/migrations/).

### Verification

```sh
npm test
npm run test:integration
npm run test:integration:built
npm run lint
npm run build
docker compose config --quiet
docker compose build
docker compose up -d --wait
curl -f http://localhost:3000/api/health
```

Integration tests use the isolated PostgreSQL service on port 55439 and create
their own database-backed sessions. They do not bypass application guards.
Use a dedicated test database; never point `TEST_DATABASE_URL` at production.
The built variant runs against the compiled backend modules, including image
uploads and attached-image posting, to catch production-only module-loading
errors. The backend's Node16 module mode preserves native dynamic imports for
ES-module-only dependencies such as `file-type`.

API lists use bounded limits and explicit `sort=asc|desc`. Posts use composite
timestamp/UUID cursor pagination; members use UUID cursor pagination. Default
page size is 30 and maximum is 100. SSE carries change notifications, not
private post payloads, and rechecks the session on each notification/heartbeat.

Browser checks performed during development cover desktop/mobile layout, draft
preservation, grouped marker selection, card dismissal, profile save, and
map-based check-in. A full OAuth round trip requires your real Discord app and
server configuration and has not been verified without those credentials.
