# Maintenance Scripts

Production maintenance utilities for Venice Wood Ltd backend.

## Scripts

| Script                | Purpose                                    | Schedule                 |
| --------------------- | ------------------------------------------ | ------------------------ |
| `healthCheck.js`      | Verify PostgreSQL, MongoDB, GridFS, memory | Every 5 min (monitoring) |
| `securityAudit.js`    | Check env vars, credentials, SSL, users    | Weekly                   |
| `dbIntegrity.js`      | Validate data consistency across both DBs  | Daily                    |
| `gridfsCleanup.js`    | Remove orphaned media & GridFS files       | Weekly                   |
| `tokenCleanup.js`     | Purge old activity logs & page visits      | Daily                    |
| `performanceCheck.js` | Report table sizes, indexes, memory        | Weekly                   |
| `backup.js`           | Export all data to JSON backups            | Daily                    |
| `logRotation.js`      | Compress old logs, delete expired          | Daily                    |
| `fullSystemCheck.js`  | Run all checks in sequence                 | On deploy                |

## Usage

```bash
# Individual
node maintenance/healthCheck.js
node maintenance/securityAudit.js
node maintenance/dbIntegrity.js
node maintenance/gridfsCleanup.js --dry-run
node maintenance/gridfsCleanup.js
node maintenance/tokenCleanup.js
node maintenance/performanceCheck.js
node maintenance/backup.js --output=./backups
node maintenance/logRotation.js --max-age=30
node maintenance/fullSystemCheck.js

# Via npm scripts
npm run maintenance:health
npm run maintenance:security
npm run maintenance:db
npm run maintenance:gridfs
npm run maintenance:cleanup
npm run maintenance:performance
npm run maintenance:backup
npm run maintenance:logs
npm run maintenance:full
```

## Exit Codes

- `0` — All checks passed
- `1` — One or more checks failed (action required)

## Cron Example

```cron
# Health check every 5 minutes
*/5 * * * * cd /app && node maintenance/healthCheck.js >> /var/log/venice-health.log 2>&1

# Daily cleanup at 2 AM
0 2 * * * cd /app && node maintenance/tokenCleanup.js && node maintenance/logRotation.js

# Daily backup at 3 AM
0 3 * * * cd /app && node maintenance/backup.js

# Weekly security + integrity on Sunday 4 AM
0 4 * * 0 cd /app && node maintenance/securityAudit.js && node maintenance/dbIntegrity.js

# Weekly GridFS cleanup on Sunday 5 AM
0 5 * * 0 cd /app && node maintenance/gridfsCleanup.js
```
