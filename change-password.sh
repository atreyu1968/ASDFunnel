#!/bin/bash
set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

CONFIG_DIR="/etc/asdfunnel"
APP_NAME="asdfunnel"

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERROR]${NC} Este script debe ejecutarse como root"
    echo "  Uso: sudo bash change-password.sh"
    exit 1
fi

if [ ! -f "$CONFIG_DIR/env" ]; then
    echo -e "${RED}[ERROR]${NC} No se encontró la configuración en $CONFIG_DIR/env"
    exit 1
fi

echo ""
echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║          CAMBIAR CONTRASEÑA DE ADMINISTRACIÓN             ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

while true; do
    read -sp "  Nueva contraseña: " ADMIN_PASS
    echo ""
    read -sp "  Confirmar contraseña: " ADMIN_PASS2
    echo ""
    if [ "$ADMIN_PASS" = "$ADMIN_PASS2" ] && [ -n "$ADMIN_PASS" ]; then
        break
    fi
    echo -e "${RED}[ERROR]${NC} Las contraseñas no coinciden o están vacías. Inténtalo de nuevo."
done

ADMIN_PASSWORD_HASH=$(node -e "
  const crypto = require('crypto');
  const salt = crypto.randomBytes(16).toString('hex');
  crypto.scrypt(process.argv[1], salt, 64, (err, key) => {
    process.stdout.write(salt + ':' + key.toString('hex'));
  });
" "$ADMIN_PASS")

if grep -q "^ADMIN_PASSWORD_HASH=" "$CONFIG_DIR/env"; then
    sed -i "s|^ADMIN_PASSWORD_HASH=.*|ADMIN_PASSWORD_HASH=$ADMIN_PASSWORD_HASH|" "$CONFIG_DIR/env"
else
    echo "ADMIN_PASSWORD_HASH=$ADMIN_PASSWORD_HASH" >> "$CONFIG_DIR/env"
fi

systemctl restart "$APP_NAME"
echo ""
echo -e "${GREEN}[OK]${NC} Contraseña cambiada correctamente. Servicio reiniciado."
echo ""
