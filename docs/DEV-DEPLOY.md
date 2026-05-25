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

## If the site is down

The workflow now **health-checks before stopping** the old container. If deploy fails, the previous container may still be running, or nothing is on 8011 — re-run a green workflow.

On the server:

```bash
docker ps -a | grep seo-agent
docker logs seo-agent-DEV --tail 100
```
