#!/usr/bin/env bash
# Préparation du serveur (exécuté à distance par deploy.sh --setup). Idempotent : peut être relancé sans risque.
# Variables reçues : REMOTE_DIR DOMAIN APP_PORT SERVICE_NAME CERTBOT_EMAIL
# Compatible Debian / Ubuntu. Ne modifie pas les sites existants : ajoute seulement un site pour DOMAIN.
set -euo pipefail
USER_NAME=$(whoami)
say() { echo "  • $*"; }

echo "  • Droits administrateur (sudo peut demander le mot de passe de $USER_NAME)"
sudo -v || { echo "✗ L'utilisateur $USER_NAME doit pouvoir utiliser sudo."; exit 1; }

# 1. Node.js 22 (si absent ou trop ancien)
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/' || echo 0)
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  say "Installation de Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  sudo apt-get install -y nodejs >/dev/null
else
  say "Node.js $(node -v) déjà présent"
fi

# 2. Port libre ?
if ss -ltn "( sport = :$APP_PORT )" | grep -q LISTEN && ! systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "✗ Le port $APP_PORT est déjà utilisé sur le serveur. Changez APP_PORT dans deploy/deploy.env."; exit 1
fi

# 3. Dossiers et secrets (jamais écrasés)
case "$REMOTE_DIR" in /var/www/html|/var/www/html/*)
  echo "✗ $REMOTE_DIR est dans le dossier public d'Apache : les secrets (.env) seraient téléchargeables. Choisissez par ex. /var/www/jammjigeen."; exit 1;;
esac
[ -d "$REMOTE_DIR" ] || sudo mkdir -p "$REMOTE_DIR"
[ -w "$REMOTE_DIR" ] || sudo chown "$USER_NAME": "$REMOTE_DIR"
mkdir -p "$REMOTE_DIR/releases" "$REMOTE_DIR/shared/var"
chmod 700 "$REMOTE_DIR/shared"
ENV="$REMOTE_DIR/shared/.env"
if [ ! -f "$ENV" ]; then
  say "Création de $ENV avec des secrets générés"
  umask 077
  cat > "$ENV" <<EOF
NODE_ENV=production
PORT=$APP_PORT
DATA_DIR=$REMOTE_DIR/shared/var
HASH_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
ADMIN_TOKEN=$(openssl rand -hex 24)
CODE_WORD=mango
FOLLOWUP_DELAY_MINUTES=4320
ALERT_RETENTION_DAYS=90
STATS_THRESHOLD=10
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=$(openssl rand -hex 16)
WHATSAPP_APP_SECRET=
WHATSAPP_FOLLOWUP_TEMPLATE=
RELAY_WHATSAPP=
ANTHROPIC_API_KEY=
LLM_MODEL=claude-haiku-5-5
EOF
else
  say "$ENV existe déjà (conservé)"
fi

# 4. Service systemd
say "Service systemd $SERVICE_NAME"
sudo tee "/etc/systemd/system/$SERVICE_NAME.service" >/dev/null <<EOF
[Unit]
Description=Jigéen Ngir Jàmm
After=network.target

[Service]
User=$USER_NAME
WorkingDirectory=$REMOTE_DIR/current
EnvironmentFile=$REMOTE_DIR/shared/.env
ExecStart=$(command -v node) src/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME" >/dev/null 2>&1

# 5. Serveur web (Nginx de préférence, sinon Apache s'il est déjà utilisé)
# Les fichiers de site ne sont créés qu'une fois : Certbot les modifie ensuite (HTTPS), il ne faut pas les écraser.
WWW="www.$DOMAIN"
if command -v nginx >/dev/null || ! systemctl is-active --quiet apache2; then
  command -v nginx >/dev/null || { say "Installation de Nginx"; sudo apt-get install -y nginx >/dev/null; }
  SITE=/etc/nginx/sites-available/$SERVICE_NAME
  if [ ! -f "$SITE" ]; then
    say "Site Nginx pour $DOMAIN"
    sudo tee "$SITE" >/dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    access_log off;   # pas de journal d'accès : discrétion des utilisatrices
    client_max_body_size 1m;
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  else say "Site Nginx pour $DOMAIN déjà présent (conservé)"; fi
  SITE_WWW=/etc/nginx/sites-available/$SERVICE_NAME-www
  if [ ! -f "$SITE_WWW" ]; then
    say "Redirection $WWW → $DOMAIN"
    sudo tee "$SITE_WWW" >/dev/null <<EOF
server {
    listen 80;
    server_name $WWW;
    access_log off;
    return 301 https://$DOMAIN\$request_uri;
}
EOF
  fi
  sudo ln -sfn "$SITE" "/etc/nginx/sites-enabled/$SERVICE_NAME"
  sudo ln -sfn "$SITE_WWW" "/etc/nginx/sites-enabled/$SERVICE_NAME-www"
  sudo nginx -t >/dev/null 2>&1 || { echo "✗ Configuration Nginx invalide, sites retirés."; sudo rm -f "/etc/nginx/sites-enabled/$SERVICE_NAME" "/etc/nginx/sites-enabled/$SERVICE_NAME-www"; exit 1; }
  sudo systemctl reload nginx
  PLUGIN=--nginx
else
  sudo a2enmod proxy proxy_http headers rewrite >/dev/null
  CONF=/etc/apache2/sites-available/$SERVICE_NAME.conf
  if [ ! -f "$CONF" ]; then
    say "Apache détecté : vhost pour $DOMAIN"
    sudo tee "$CONF" >/dev/null <<EOF
<VirtualHost *:80>
    ServerName $DOMAIN
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:$APP_PORT/
    ProxyPassReverse / http://127.0.0.1:$APP_PORT/
    CustomLog /dev/null common
</VirtualHost>
EOF
  else say "Vhost Apache pour $DOMAIN déjà présent (conservé)"; fi
  CONF_WWW=/etc/apache2/sites-available/$SERVICE_NAME-www.conf
  if [ ! -f "$CONF_WWW" ]; then
    say "Redirection $WWW → $DOMAIN"
    sudo tee "$CONF_WWW" >/dev/null <<EOF
<VirtualHost *:80>
    ServerName $WWW
    Redirect permanent / https://$DOMAIN/
    CustomLog /dev/null common
</VirtualHost>
EOF
  fi
  sudo a2ensite "$SERVICE_NAME" "$SERVICE_NAME-www" >/dev/null
  sudo apache2ctl configtest >/dev/null 2>&1 || { echo "✗ Configuration Apache invalide, sites désactivés."; sudo a2dissite "$SERVICE_NAME-www" >/dev/null; exit 1; }
  sudo systemctl reload apache2
  PLUGIN=--apache
fi

# 6. HTTPS (Let's Encrypt) — un certificat pour le domaine, un pour www (qui redirige)
has_cert() { sudo certbot certificates 2>/dev/null | grep -Eq "Domains: (.* )?$1( |$)"; }
if [ -n "${CERTBOT_EMAIL:-}" ]; then
  command -v certbot >/dev/null || { say "Installation de Certbot"; sudo apt-get install -y certbot "python3-certbot-${PLUGIN#--}" >/dev/null; }
  if has_cert "$DOMAIN"; then say "Certificat HTTPS de $DOMAIN déjà présent"
  else
    say "Certificat HTTPS pour $DOMAIN"
    sudo certbot $PLUGIN -d "$DOMAIN" -m "$CERTBOT_EMAIL" --agree-tos --redirect --non-interactive \
      || echo "  ⚠ Certificat non obtenu : vérifiez que le DNS de $DOMAIN pointe vers ce serveur, puis relancez --setup."
  fi
  if has_cert "$WWW"; then say "Certificat HTTPS de $WWW déjà présent"
  else
    say "Certificat HTTPS pour $WWW"
    sudo certbot $PLUGIN -d "$WWW" -m "$CERTBOT_EMAIL" --agree-tos --non-interactive \
      || echo "  ⚠ Certificat $WWW non obtenu : vérifiez l'enregistrement DNS de $WWW."
  fi
else
  echo "  ⚠ CERTBOT_EMAIL vide : pas de HTTPS. WhatsApp exige HTTPS."
fi

echo "  ✓ Serveur prêt. Secrets dans $ENV (compléter les clés WhatsApp)."
