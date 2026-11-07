#!/usr/bin/env bash
# Mise en ligne de Jigéen Ngir Jàmm sur le serveur, depuis le dossier de l'application.
#
#   ./deploy/deploy.sh --setup    1re fois : prépare le serveur (Node, service, Nginx/Apache, HTTPS, secrets) puis déploie
#   ./deploy/deploy.sh            déploie une nouvelle version
#   ./deploy/deploy.sh --rollback revient à la version précédente
#   ./deploy/deploy.sh --status   état du service et derniers journaux
#
# Chaque version est installée dans REMOTE_DIR/releases/<date>, le lien REMOTE_DIR/current pointe sur la version active.
# Les secrets (REMOTE_DIR/shared/.env) et les données (REMOTE_DIR/shared/var) ne sont jamais écrasés.
set -euo pipefail

cd "$(dirname "$0")/.."
CONF=deploy/deploy.env
[[ -f $CONF ]] || { echo "✗ $CONF introuvable : copiez deploy/deploy.env.example en deploy/deploy.env et complétez-le."; exit 1; }
# shellcheck disable=SC1090
source "$CONF"
for v in SERVER_USER SERVER_HOST REMOTE_DIR DOMAIN APP_PORT SERVICE_NAME; do
  [[ -n "${!v:-}" ]] || { echo "✗ $v manquant dans $CONF"; exit 1; }
done
SERVER_PORT=${SERVER_PORT:-22}
SSH=(ssh -p "$SERVER_PORT" -o ServerAliveInterval=30 "$SERVER_USER@$SERVER_HOST")
SSH_T=(ssh -t -p "$SERVER_PORT" -o ServerAliveInterval=30 "$SERVER_USER@$SERVER_HOST")  # -t : permet à sudo de demander le mot de passe
remote() { "${SSH[@]}" "$@"; }
remote_t() { "${SSH_T[@]}" "$@"; }

case "${1:-}" in
  --status)
    remote_t "systemctl status $SERVICE_NAME --no-pager | head -15; echo; sudo journalctl -u $SERVICE_NAME -n 30 --no-pager"
    exit 0 ;;
  --rollback)
    remote_t "set -e; cd '$REMOTE_DIR/releases'; prev=\$(ls -1 | sort | tail -2 | head -1); cur=\$(basename \$(readlink -f '$REMOTE_DIR/current'));
      [ \"\$prev\" != \"\$cur\" ] || { echo 'Aucune version précédente.'; exit 1; }
      ln -sfn '$REMOTE_DIR/releases/'\$prev '$REMOTE_DIR/current'; sudo systemctl restart $SERVICE_NAME; echo \"↩ Retour à \$prev\""
    exit 0 ;;
esac

echo "→ Tests"
if command -v npm >/dev/null && [[ -d node_modules ]]; then npm test --silent >/dev/null && echo "  ✓ tests OK"; else echo "  (tests ignorés : lancez npm install pour les activer)"; fi

if [[ "${1:-}" == "--setup" ]]; then
  echo "→ Préparation du serveur $SERVER_HOST"
  remote "cat > /tmp/jnj-setup.sh" < deploy/setup-server.sh
  remote_t "REMOTE_DIR='$REMOTE_DIR' DOMAIN='$DOMAIN' APP_PORT='$APP_PORT' SERVICE_NAME='$SERVICE_NAME' CERTBOT_EMAIL='${CERTBOT_EMAIL:-}' bash /tmp/jnj-setup.sh; rc=\$?; rm -f /tmp/jnj-setup.sh; exit \$rc"
fi

REL=$(date +%Y%m%d-%H%M%S)
echo "→ Envoi de la version $REL"
# Sur macOS (bsdtar), ne pas envoyer les attributs étendus Apple (évite les avertissements côté serveur).
TAR_EXTRA=()
tar --version 2>/dev/null | grep -q bsdtar && TAR_EXTRA=(--no-mac-metadata --no-xattrs)
COPYFILE_DISABLE=1 tar ${TAR_EXTRA[@]+"${TAR_EXTRA[@]}"} -czf - \
  --exclude=./node_modules --exclude=./var --exclude=./.env --exclude=./.git \
  --exclude=./deploy/deploy.env --exclude='*.zip' --exclude=.DS_Store . \
  | remote "mkdir -p '$REMOTE_DIR/releases/$REL' && tar xzf - -C '$REMOTE_DIR/releases/$REL'"

echo "→ Installation et redémarrage"
remote_t "set -e
  cd '$REMOTE_DIR/releases/$REL'
  npm ci --omit=dev --no-audit --no-fund --loglevel=error
  ln -sfn '$REMOTE_DIR/shared/.env' .env
  ln -sfn '$REMOTE_DIR/releases/$REL' '$REMOTE_DIR/current'
  sudo systemctl restart '$SERVICE_NAME'
  sleep 2
  curl -fsS 'http://127.0.0.1:$APP_PORT/health' >/dev/null && echo '  ✓ application démarrée' || { echo '  ✗ l’application ne répond pas'; sudo journalctl -u '$SERVICE_NAME' -n 20 --no-pager; exit 1; }
  cd '$REMOTE_DIR/releases' && ls -1 | sort | head -n -5 | xargs -r rm -rf   # garde les 5 dernières versions"

echo "→ Vérification publique"
if curl -fsS --max-time 10 "https://$DOMAIN/health"; then echo; echo "✓ En ligne : https://$DOMAIN"; else echo "⚠ https://$DOMAIN ne répond pas encore (DNS ou certificat en cours ?)"; fi
