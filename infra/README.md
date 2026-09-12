# Tafeltikker infra

Provisioning for the Debian LXC container (Proxmox) that runs Tafeltikker, so
the environment can be rebuilt from git alone, without manual steps.

Not filled in yet — this becomes real once the app has something worth
deploying. Planned contents:

- `setup.sh` — apt packages, Node.js install, clones/copies `app/`, installs
  dependencies, builds it.
- `tafeltikker.service` — systemd unit running `app/`.
- `nginx.conf` — reverse-proxy site config for the LXC's nginx.

Target environment (adjust if the actual container differs): Debian 12,
Node.js 20 LTS.
