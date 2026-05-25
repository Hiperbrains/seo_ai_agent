# DEV deploy checklist (`3.137.24.145:8011`)

## Required GitHub secret

**`APPSETTINGS_JSON`** — paste the full contents of your local `appsettings.json` (with real `ConnectionStrings.Hiperbrains` and API keys).

Optional: **`CONFIG_SERVER_DEV`** — config server URL if you use remote config instead.

## Deploy

Push to branch **`DEV`** or run **Actions → Build & Deploy SEO Agent → Run workflow → DEV**.

A successful run takes **several minutes** and ends with `http://127.0.0.1:8011/health OK` in the log.

## Verify

- `http://3.137.24.145:8011/health` → `{"ok":true}`
- `http://3.137.24.145:8011/api/auth/mode` → `{"multiTenant":true}`
- `http://3.137.24.145:8011/login` → SEOFlow login page

## If the site is down (`ERR_CONNECTION_REFUSED`)

Usually the last deploy **stopped the old container** then the new image failed to start. Fix:

1. **GitHub → Actions → Build & Deploy SEO Agent** — open the latest **DEV** run; if red, read the step log (probe health vs production health).
2. Confirm secret **`APPSETTINGS_JSON`** is set (full `appsettings.json` with `ConnectionStrings.Hiperbrains`).
3. **Re-run** the failed workflow (or push an empty commit to `DEV`).

On the EC2 / self-hosted runner:

```bash
docker ps -a | grep seo-agent
docker logs seo-agent-DEV --tail 100
# If container missing, start last known good image (replace tag):
docker images | grep seo_ai_agent
docker run -d --name seo-agent-DEV -p 0.0.0.0:8011:8080 --env-file /path/to/.env \
  -v hiperbrains-DEV-data:/app/data --restart unless-stopped <IMAGE:DEV-xxxxxxx>
```

After a green deploy, verify:

- `curl http://127.0.0.1:8011/health`
- `curl http://127.0.0.1:8011/api/auth/mode` → `multiTenant: true` when Postgres is in `.env`
