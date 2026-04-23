# LocalDisk Workday Extend App

## GitHub Actions Setup

Two workflows are included:

| Workflow | Trigger | Purpose |
|---|---|---|
| `deploy-on-merge.yml` | Push to `main` | Automatically deploys on merge |
| `deployToDev.yml` | Manual (`workflow_dispatch`) | Manually deploy a specific version |

### 1. Add Secrets

Go to **Settings → Secrets and variables → Actions → Secrets** and add:

| Secret | Description |
|---|---|
| `WDCLI_CLIENT_ID` | Workday system user client ID |
| `WDCLI_CLIENT_SECRET` | Workday system user client secret |

### 2. Add Variables

Go to **Settings → Secrets and variables → Actions → Variables** and add:

| Variable | Example | Description |
|---|---|---|
| `WDCLI_APP_REF_ID` | `localdisk_nkzjqw` | App reference ID |
| `WDCLI_TENANT_ALIAS` | `my-tenant` | Tenant lookup alias |
| `WDCLI_ACCOUNT` | `nkzjqw` | Account short ID |

### 3. How it works

On every merge to `main`, the deploy workflow will:

1. Check out the repo
2. Extract `bin/wdcli-installer-linux-x64-v1.7.25.tar.gz`
3. Authenticate using `wdcli auth login --system-user` with the secrets above
4. Run `wdcli app deploy` using the variables above
5. Log out

### 4. Manual deploy

To deploy a specific version manually:

1. Go to **Actions → Promote App to Workday → Run workflow**
2. Fill in the reference ID, tenant alias, account, and optionally a version number
3. Leave version blank to deploy the latest version
