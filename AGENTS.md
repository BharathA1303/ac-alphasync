# Academic AlphaSync - Agent Guidelines & Server Access

## Server & Infrastructure Details
- **Server Host Alias**: `alphasync` (configured in `~/.ssh/config`)
- **Server IP**: `147.93.168.157`
- **User**: `root`
- **SSH Key**: `~/.ssh/id_ed25519`
- **Deploy Path**: `/opt/acalphasync`
- **Domain**: `https://ac.alphasync.app`

## Container Stack
- **Backend**: `acalphasync-backend` (Port 8003 -> 8000)
- **Frontend**: `acalphasync-frontend` (Port 3003 -> 80)
- **Database**: `acalphasync-pg` (Port 5436 -> 5432)
- **Redis**: `acalphasync-redis` (Port 6379)

## Deployment Architecture & Workflow
1. **Local Changes**: Modify and test code locally.
2. **Push to Main**: `git push origin main` triggers `.github/workflows/deploy.yml`.
3. **CI/CD Build & Deploy**: GitHub Actions builds Docker images (`ghcr.io/bharatha1303/acalphasync-*`) and deploys them to `/opt/acalphasync`.
4. **Server Verification**: The agent can run remote commands directly via SSH to verify logs, health, and status:
   ```powershell
   # Check container status
   ssh alphasync "docker ps"

   # Check backend logs
   ssh alphasync "docker logs acalphasync-backend --tail 100"

   # Check frontend logs
   ssh alphasync "docker logs acalphasync-frontend --tail 100"

   # Check backend health
   ssh alphasync "docker inspect --format='{{.State.Health.Status}}' acalphasync-backend"
   ```
