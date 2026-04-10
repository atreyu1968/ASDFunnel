#!/bin/bash
set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_PORT="5000"
NGINX_CONF="/etc/nginx/sites-available/asdfunnel"

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERROR]${NC} Este script debe ejecutarse como root (sudo)"
    exit 1
fi

if [ -z "$1" ]; then
    echo ""
    echo -e "${BLUE}Uso:${NC} sudo bash add-author-domain.sh <dominio>"
    echo ""
    echo "  Ejemplos:"
    echo "    sudo bash add-author-domain.sh elizabethblack.com"
    echo "    sudo bash add-author-domain.sh misteriososcuros.es"
    echo ""
    echo -e "${YELLOW}Recuerda:${NC}"
    echo "  1. El DNS del dominio debe apuntar a la IP de este servidor"
    echo "  2. El dominio debe estar configurado en el campo 'Dominio' del autor en el panel"
    echo ""
    exit 1
fi

DOMAIN="$1"
DOMAIN_CLEAN=$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]' | tr -d ' ')

if grep -q "server_name.*${DOMAIN_CLEAN}" "$NGINX_CONF" 2>/dev/null; then
    echo -e "${YELLOW}[AVISO]${NC} El dominio '$DOMAIN_CLEAN' ya está configurado en Nginx"
    exit 0
fi

echo "" >> "$NGINX_CONF"
cat >> "$NGINX_CONF" << NGINX

server {
    listen 80;
    server_name ${DOMAIN_CLEAN} www.${DOMAIN_CLEAN};
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
NGINX

if nginx -t 2>/dev/null; then
    systemctl reload nginx
    echo -e "${GREEN}[OK]${NC} Dominio '${DOMAIN_CLEAN}' añadido correctamente"
    echo ""
    echo -e "  ${BLUE}Siguiente paso:${NC}"
    echo "    1. Asegúrate de que el DNS de '${DOMAIN_CLEAN}' apunta a: $(hostname -I | awk '{print $1}')"
    echo "    2. En el panel admin, edita el autor y pon '${DOMAIN_CLEAN}' en el campo Dominio"
    echo "    3. Crea las landing pages del autor y publícalas"
    echo ""
    echo -e "  ${BLUE}Para HTTPS con Cloudflare:${NC}"
    echo "    Activa el proxy (nube naranja) en el registro DNS de Cloudflare"
    echo "    Cloudflare se encargará del certificado SSL automáticamente"
    echo ""
else
    echo -e "${RED}[ERROR]${NC} Error en la configuración de Nginx. Revisa: nginx -t"
    exit 1
fi
