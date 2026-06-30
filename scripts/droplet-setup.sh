#!/bin/sh
# DigitalOcean startup script — körs en gång som root vid första boot.
# Klistra in under Advanced Options → User Data när dropleten skapas.
# Loggas till /var/log/droplet-setup.log
set -e
export DEBIAN_FRONTEND=noninteractive
exec > /var/log/droplet-setup.log 2>&1

echo "=== $(date) Startar droplet-setup ==="

# Paketlista
apt-get update -y
apt-get upgrade -y
apt-get install -y curl ufw debian-keyring debian-archive-keyring apt-transport-https

# Docker
echo "=== $(date) Installerar Docker ==="
curl -fsSL https://get.docker.com | sh

# Caddy
echo "=== $(date) Installerar Caddy ==="
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

# Brandvägg
echo "=== $(date) Konfigurerar ufw ==="
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable

# Katalogstruktur
mkdir -p /opt/exchange

echo "=== $(date) Droplet-setup klar ==="
