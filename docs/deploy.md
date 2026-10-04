# Deploying Diploma Tracker with Docker

The app runs as three containers started together by `docker-compose.yml`:

| Container | Contents | Reachable from |
|---|---|---|
| `web` | nginx serving the React app; forwards `/api/*` to `api` | the browser, on `APP_PORT` |
| `api` | the ASP.NET 8 API; applies migrations and creates the first admin on startup | `web` only |
| `db` | SQL Server 2022 Express | `api` only |

Only `web` publishes a port. `api` and `db` sit on internal Docker networks (`app`, `data`):
other machines and other projects' containers cannot connect to them, and they have no
internet access. SQL Server is never exposed, so there is no database port to scan.

Data lives in two Docker volumes, `diploma-tracker_db-data` (the database) and
`diploma-tracker_uploads` (uploaded and generated documents). They survive restarts, rebuilds
and `docker compose down`.

## Shared-server rules

The university server runs many other projects, and the `docker` group can touch all of them.

- Run Docker commands only as `docker compose ...` from inside the `diploma_tracker` folder.
  The project name `diploma-tracker` keeps them scoped to our three containers.
- Never run `docker system prune`, `docker volume prune`, or `docker rm`/`stop`/`volume rm`
  on anything that is not ours.
- `docker compose down -v` deletes our database and uploads. Do not use `-v` unless that is
  the goal.

## How the code reaches the server

The server has no access to the private repositories, so a committed branch is packed on the
developer's PC and copied over. The archive holds exactly what is committed: no `node_modules`,
build output or local `.env`.

On the PC, in PowerShell, from the project folder (replace `BRANCH`, normally `master`):

```bash
git archive --format=tar.gz -o "$env:USERPROFILE\diploma-tracker.tar.gz" BRANCH
```

Copy it to the server (asks for the server password):

```bash
scp "$env:USERPROFILE\diploma-tracker.tar.gz" LOGIN@SERVER_IP:~/
```

## First deployment

Connect from PowerShell (the password is not echoed while typing):

```bash
ssh LOGIN@SERVER_IP
```

Unpack the archive into `~/diploma_tracker`:

```bash
mkdir -p ~/diploma_tracker && tar -xzf ~/diploma-tracker.tar.gz -C ~/diploma_tracker && rm ~/diploma-tracker.tar.gz && cd ~/diploma_tracker
```

Create `.env` with generated secrets. Replace `SERVER_IP` and `YOUR_EMAIL` first; the secrets
are never printed:

```bash
IP=SERVER_IP; EMAIL=YOUR_EMAIL; cp .env.example .env && sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=http://$IP:4047|; s|^DB_PASSWORD=.*|DB_PASSWORD=Dt$(openssl rand -hex 16)|; s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|; s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=$EMAIL|; s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=Adm$(openssl rand -hex 8)|" .env && chmod 600 .env && grep -E '^(APP_PORT|PUBLIC_URL|ADMIN_EMAIL)=' .env
```

- `APP_PORT`: 4047, the port the university gave the project.
- `PUBLIC_URL`: `http://SERVER_IP:4047`, exactly as people type it in the browser.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: the first administrator, created on the first start only.
  Read the password with `grep ADMIN_PASSWORD ~/diploma_tracker/.env` and change it in the
  app after signing in.

Build and start (the first run downloads about 2 GB and takes several minutes):

```bash
docker compose up -d --build
```

Check that all three containers are `Up` (and `db` is `healthy`):

```bash
docker compose ps
```

Open `PUBLIC_URL` in a browser and sign in as the administrator. The health check is at
`PUBLIC_URL/api/health`.

## Updating to a newer version

Pack and copy the new version as in *How the code reaches the server*, then on the server:

```bash
cd ~/diploma_tracker && tar -xzf ~/diploma-tracker.tar.gz && rm ~/diploma-tracker.tar.gz && docker compose up -d --build
```

Unpacking over the folder keeps `.env`, which is not in the archive. Only containers whose code
changed are rebuilt. Migrations run automatically when `api` starts.
If `PUBLIC_URL` changes, the same command rebuilds `web` with the new address.

## Day-to-day commands

All of them run inside `~/diploma_tracker`.

| Goal | Command |
|---|---|
| Container status | `docker compose ps` |
| Last API log lines | `docker compose logs --tail 100 api` |
| Follow all logs live (`Ctrl+C` stops watching, not the app) | `docker compose logs -f` |
| Restart the API | `docker compose restart api` |
| Stop everything (data kept) | `docker compose down` |
| Start again | `docker compose up -d` |

## Backing up the database

Create a backup inside the `db` container and copy it to the home folder:

```bash
docker compose exec db bash -c '/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -Q "BACKUP DATABASE DiplomaTracker TO DISK = N'"'"'/var/opt/mssql/backup.bak'"'"' WITH INIT"'
```

```bash
docker compose cp db:/var/opt/mssql/backup.bak ~/diploma-tracker-$(date +%F).bak
```

Download it to Windows from a PowerShell window on your own PC:

```bash
scp LOGIN@SERVER_IP:~/diploma-tracker-*.bak .
```

## Troubleshooting

- **`api` keeps restarting:** run `docker compose logs --tail 100 api`. Startup validation names
  the missing or invalid setting (JWT secret length, admin password length, CORS origin).
- **`db` is `unhealthy`:** `DB_PASSWORD` does not meet SQL Server's policy (8+ characters with
  upper case, lower case and digits). Fix `.env`, then `docker compose down -v` (the database
  never started, so nothing is lost) and `docker compose up -d --build`.
- **The page loads but sign-in fails with a network error:** `PUBLIC_URL` does not match the
  address in the browser bar. Fix `.env` and run `docker compose up -d --build`.
- **`port is already allocated`:** another project took `APP_PORT`; check with the university.
- **Changing `DB_PASSWORD` after the first start** does not change the existing database's
  password. Keep the original value.
- **Sign-in rate limiting is off** in this setup, because behind nginx every request comes from
  the proxy's address. Turning it on needs the API to read `X-Forwarded-For` first.
