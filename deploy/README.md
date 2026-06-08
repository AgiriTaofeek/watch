# Deploy

Docker Compose and env examples for local development.

## Local Postgres

Start the database:

```bash
docker compose -f deploy/docker-compose.yml up -d
```

The database is available at:

```txt
postgres://watch:watch@localhost:5432/watch?sslmode=disable
```

## Browser Database UI

Start the optional pgweb profile when you want to inspect tables in the
browser:

```bash
docker compose -f deploy/docker-compose.yml --profile db-ui up -d
```

Then open:

```txt
http://localhost:8081
```

This profile is opt-in. The normal `docker compose -f deploy/docker-compose.yml
up -d` command still starts only Postgres, so the debugging UI does not affect
the default local stack.

Stop the UI without stopping Postgres:

```bash
docker compose -f deploy/docker-compose.yml stop pgweb
```
