#!/bin/bash
set -eo pipefail

# ==============================================================================
# ASD FUNNEL - Autoinstalador para Ubuntu 22.04/24.04
# Atreyu Servicios Digitales
# ==============================================================================

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

print_status()  { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
print_step()    { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }

# ─── Configuración ────────────────────────────────────────────────────────────
APP_NAME="asdfunnel"
APP_DIR="/var/www/$APP_NAME"
CONFIG_DIR="/etc/$APP_NAME"
UPLOAD_DIR="/var/www/$APP_NAME/uploads"
APP_PORT="5000"
APP_USER="asdfunnel"
DB_NAME="asdfunnel"
DB_USER="asdfunnel"
GITHUB_REPO="https://github.com/atreyu1968/ASDFunnel.git"
NODE_VERSION="20"
PNPM_VERSION="9"

# ─── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}"
echo "    ╔═══════════════════════════════════════════════╗"
echo "    ║           ASD FUNNEL - INSTALADOR             ║"
echo "    ║        Atreyu Servicios Digitales              ║"
echo "    ║     Panel de Gestión Editorial Digital         ║"
echo "    ╚═══════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Verificar root ──────────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    print_error "Este script debe ejecutarse como root (sudo bash install.sh)"
    exit 1
fi

# ─── Detectar instalación existente ───────────────────────────────────────────
IS_UPDATE=false
if [ -f "$CONFIG_DIR/env" ]; then
    IS_UPDATE=true
    print_warning "Instalación existente detectada. Se actualizará preservando la configuración."
    EXISTING_DB_URL=$(grep -E '^DATABASE_URL=' "$CONFIG_DIR/env" | cut -d= -f2-)
    EXISTING_DB_PASS=$(echo "$EXISTING_DB_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
    EXISTING_SESSION_SECRET=$(grep -E '^SESSION_SECRET=' "$CONFIG_DIR/env" | cut -d= -f2-)
else
    print_status "Nueva instalación detectada."
fi

# ─── 1. Dependencias del sistema ─────────────────────────────────────────────
print_step "1/8 Instalando dependencias del sistema"

apt-get update -qq
apt-get install -y -qq curl git build-essential nginx postgresql postgresql-contrib
apt-mark manual nginx
print_success "Dependencias del sistema instaladas"

# ─── 2. Node.js y pnpm ──────────────────────────────────────────────────────
print_step "2/8 Instalando Node.js $NODE_VERSION y pnpm"

if command -v node &>/dev/null; then
    CURRENT_NODE=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$CURRENT_NODE" -ge "$NODE_VERSION" ]; then
        print_status "Node.js $(node -v) ya instalado"
    else
        print_status "Actualizando Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
        apt-get install -y -qq nodejs
    fi
else
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y -qq nodejs
fi

chmod 755 /usr/bin/node /usr/bin/npm

if ! command -v pnpm &>/dev/null; then
    npm install -g pnpm@${PNPM_VERSION}
    print_success "pnpm instalado"
else
    print_status "pnpm $(pnpm -v) ya instalado"
fi

print_success "Node.js $(node -v) + pnpm $(pnpm -v)"

# ─── 3. PostgreSQL ──────────────────────────────────────────────────────────
print_step "3/8 Configurando PostgreSQL"

systemctl enable postgresql
systemctl start postgresql

if [ "$IS_UPDATE" = false ]; then
    DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    SESSION_SECRET=$(openssl rand -base64 32)

    sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
        sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
    sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
        sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

    PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file;" | tr -d ' ')
    if ! grep -q "$DB_USER" "$PG_HBA" 2>/dev/null; then
        sed -i "/^# IPv4 local connections:/a host    $DB_NAME    $DB_USER    127.0.0.1/32    md5" "$PG_HBA"
        sed -i "/^# \"local\" is for Unix/a local   $DB_NAME    $DB_USER                    md5" "$PG_HBA"
        systemctl reload postgresql
    fi

    print_success "Base de datos '$DB_NAME' creada con usuario '$DB_USER'"
else
    DB_PASS="$EXISTING_DB_PASS"
    SESSION_SECRET="$EXISTING_SESSION_SECRET"
    print_status "Usando credenciales de base de datos existentes"
fi

DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"

# ─── 4. Usuario del sistema ─────────────────────────────────────────────────
print_step "4/8 Configurando usuario del sistema"

id "$APP_USER" &>/dev/null || useradd --system --create-home --shell /bin/bash "$APP_USER"
print_success "Usuario '$APP_USER' configurado"

# ─── 5. Clonar/actualizar código ────────────────────────────────────────────
print_step "5/8 Descargando código fuente"

git config --global --add safe.directory "$APP_DIR"

if [ -d "$APP_DIR/.git" ]; then
    cd "$APP_DIR"
    git fetch origin
    git reset --hard origin/main
    print_success "Código actualizado desde GitHub"
else
    git clone --depth 1 "$GITHUB_REPO" "$APP_DIR"
    print_success "Repositorio clonado"
fi

mkdir -p "$UPLOAD_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ─── 6. Configuración persistente ───────────────────────────────────────────
print_step "6/8 Guardando configuración"

mkdir -p "$CONFIG_DIR"

if [ "$IS_UPDATE" = false ]; then
    cat > "$CONFIG_DIR/env" << EOF
NODE_ENV=production
PORT=$APP_PORT
DATABASE_URL=$DATABASE_URL
SESSION_SECRET=$SESSION_SECRET
UPLOAD_DIR=$UPLOAD_DIR
APP_BASE_URL=http://localhost:$APP_PORT
SECURE_COOKIES=false
EOF
else
    grep -q "^UPLOAD_DIR=" "$CONFIG_DIR/env" || echo "UPLOAD_DIR=$UPLOAD_DIR" >> "$CONFIG_DIR/env"
    grep -q "^APP_BASE_URL=" "$CONFIG_DIR/env" || echo "APP_BASE_URL=http://localhost:$APP_PORT" >> "$CONFIG_DIR/env"
    grep -q "^SECURE_COOKIES=" "$CONFIG_DIR/env" || echo "SECURE_COOKIES=false" >> "$CONFIG_DIR/env"
fi

chmod 755 "$CONFIG_DIR"
chmod 644 "$CONFIG_DIR/env"
chown root:root "$CONFIG_DIR/env"

print_success "Configuración guardada en $CONFIG_DIR/env"

# ─── 7. Build de la aplicación ───────────────────────────────────────────────
print_step "7/8 Compilando aplicación"

cd "$APP_DIR"

export NODE_ENV=production
export PORT=$APP_PORT
export BASE_PATH="/"
export DATABASE_URL="$DATABASE_URL"

print_status "Instalando dependencias (pnpm install)..."
sudo -u "$APP_USER" -E pnpm install --frozen-lockfile 2>&1 | tail -3

print_status "Compilando frontend..."
sudo -u "$APP_USER" -E pnpm --filter @workspace/lennox-admin run build 2>&1 | tail -3

print_status "Compilando API server..."
sudo -u "$APP_USER" -E pnpm --filter @workspace/api-server run build 2>&1 | tail -3

print_status "Sincronizando esquema de base de datos..."
sudo -u "$APP_USER" -E pnpm --filter @workspace/db run push 2>&1 | tail -3

print_success "Aplicación compilada correctamente"

# ─── 8. Servicio systemd ────────────────────────────────────────────────────
print_step "8/8 Configurando servicios"

cat > "/etc/systemd/system/$APP_NAME.service" << EOF
[Unit]
Description=ASD Funnel - Panel de Gestión Editorial
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR/artifacts/api-server
EnvironmentFile=$CONFIG_DIR/env
ExecStart=/usr/bin/node --enable-source-maps ./dist/index.mjs
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$APP_NAME

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$APP_NAME"
print_success "Servicio systemd configurado"

# ─── Nginx ───────────────────────────────────────────────────────────────────
FRONTEND_DIR="$APP_DIR/artifacts/lennox-admin/dist/public"

cat > "/etc/nginx/sites-available/$APP_NAME" << NGINX
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    root $FRONTEND_DIR;
    index index.html;

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    # Frontend SPA - serve static files, fallback to index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

ln -sf "/etc/nginx/sites-available/$APP_NAME" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t 2>/dev/null && print_success "Configuración de Nginx válida" || print_error "Error en configuración de Nginx"

systemctl enable nginx
systemctl restart nginx
print_success "Nginx configurado como proxy reverso"

# ─── Iniciar aplicación ─────────────────────────────────────────────────────
systemctl restart "$APP_NAME"
sleep 3

if systemctl is-active --quiet "$APP_NAME"; then
    print_success "Servicio $APP_NAME iniciado correctamente"
else
    print_error "El servicio no arrancó. Revisa: journalctl -u $APP_NAME -n 50"
fi

# ─── Cloudflare Tunnel (opcional) ────────────────────────────────────────────
echo ""
echo -e "${YELLOW}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║        CLOUDFLARE TUNNEL (Opcional)            ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════╝${NC}"
echo ""
echo "Si deseas exponer la aplicación a Internet con HTTPS gratuito"
echo "mediante Cloudflare Tunnel, introduce el token aquí."
echo "Si no lo necesitas, simplemente presiona Enter."
echo ""
read -p "Token de Cloudflare Tunnel (Enter para omitir): " CF_TOKEN

if [ -n "$CF_TOKEN" ]; then
    print_status "Instalando Cloudflare Tunnel..."
    curl -L -o /tmp/cloudflared.deb \
        https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb 2>/dev/null
    dpkg -i /tmp/cloudflared.deb
    rm -f /tmp/cloudflared.deb

    cloudflared service install "$CF_TOKEN"
    systemctl enable cloudflared
    systemctl start cloudflared

    sed -i 's/SECURE_COOKIES=false/SECURE_COOKIES=true/' "$CONFIG_DIR/env"
    systemctl restart "$APP_NAME"

    print_success "Cloudflare Tunnel configurado (HTTPS habilitado)"
fi

# ─── Resumen final ───────────────────────────────────────────────────────────
SERVER_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}${BOLD}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║              INSTALACIÓN COMPLETADA                       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  ${BOLD}URL Local:${NC}        http://$SERVER_IP"
echo -e "  ${BOLD}Configuración:${NC}    $CONFIG_DIR/env"
echo -e "  ${BOLD}Archivos:${NC}         $APP_DIR"
echo -e "  ${BOLD}Uploads:${NC}          $UPLOAD_DIR"
echo -e "  ${BOLD}Base de datos:${NC}    $DB_NAME (PostgreSQL)"
echo ""
echo -e "  ${BOLD}Comandos útiles:${NC}"
echo "    Estado:        sudo systemctl status $APP_NAME"
echo "    Logs:          sudo journalctl -u $APP_NAME -f"
echo "    Reiniciar:     sudo systemctl restart $APP_NAME"
echo "    Detener:       sudo systemctl stop $APP_NAME"
echo "    Config:        sudo cat $CONFIG_DIR/env"
echo ""
if [ -n "$CF_TOKEN" ]; then
    echo -e "  ${BOLD}Cloudflare:${NC}"
    echo "    Estado:        sudo systemctl status cloudflared"
    echo "    Logs:          sudo journalctl -u cloudflared -f"
    echo ""
fi
echo -e "  ${YELLOW}Para actualizar:${NC} sudo bash $APP_DIR/install.sh"
echo ""
