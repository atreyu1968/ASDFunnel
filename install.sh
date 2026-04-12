#!/bin/bash
set -eo pipefail

# ==============================================================================
# ASD FUNNEL - Autoinstalador para Ubuntu 22.04/24.04
# Atreyu Servicios Digitales
#
# Uso en servidor recién instalado:
#   apt-get update && apt-get install -y curl
#   curl -fsSL https://raw.githubusercontent.com/atreyu1968/ASDFunnel/main/install.sh -o /tmp/install.sh
#   bash /tmp/install.sh
#
# Uso para actualizar:
#   sudo bash /var/www/asdfunnel/install.sh
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
    print_error "Este script debe ejecutarse como root"
    echo "  Uso: sudo bash install.sh"
    exit 1
fi

# ─── Verificar Ubuntu ────────────────────────────────────────────────────────
if [ -f /etc/os-release ]; then
    . /etc/os-release
    if [ "$ID" != "ubuntu" ]; then
        print_warning "Este script está diseñado para Ubuntu. Sistema detectado: $ID $VERSION_ID"
        read -p "¿Deseas continuar de todas formas? (s/N): " CONTINUE
        if [ "$CONTINUE" != "s" ] && [ "$CONTINUE" != "S" ]; then
            exit 1
        fi
    else
        print_status "Ubuntu $VERSION_ID detectado"
    fi
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

# ==============================================================================
# PASO 1: Actualizar sistema e instalar paquetes base
# ==============================================================================
print_step "1/8 Actualizando sistema e instalando paquetes base"

print_status "Actualizando lista de paquetes..."
apt-get update -qq

print_status "Instalando paquetes esenciales..."
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    curl \
    wget \
    git \
    ca-certificates \
    gnupg \
    lsb-release \
    build-essential \
    python3 \
    openssl \
    sudo \
    nginx \
    postgresql \
    postgresql-contrib \
    ufw \
    2>&1 | tail -5

apt-mark manual nginx postgresql 2>/dev/null || true

print_success "Paquetes base instalados: curl, git, nginx, postgresql, build-essential"

# ==============================================================================
# PASO 2: Instalar Node.js y pnpm
# ==============================================================================
print_step "2/8 Instalando Node.js $NODE_VERSION y pnpm"

INSTALL_NODE=true
if command -v node &>/dev/null; then
    CURRENT_NODE=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$CURRENT_NODE" -ge "$NODE_VERSION" ]; then
        print_status "Node.js $(node -v) ya instalado, omitiendo"
        INSTALL_NODE=false
    else
        print_status "Node.js $(node -v) encontrado, se necesita v$NODE_VERSION+. Actualizando..."
    fi
fi

if [ "$INSTALL_NODE" = true ]; then
    print_status "Descargando e instalando Node.js $NODE_VERSION..."
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg 2>/dev/null
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_VERSION}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs 2>&1 | tail -3
fi

chmod 755 /usr/bin/node 2>/dev/null || true
chmod 755 /usr/bin/npm 2>/dev/null || true

if ! command -v node &>/dev/null; then
    print_error "Node.js no se instaló correctamente"
    exit 1
fi

print_status "Instalando/actualizando pnpm..."
npm install -g pnpm@${PNPM_VERSION} 2>&1 | tail -2

if ! command -v pnpm &>/dev/null; then
    print_error "pnpm no se instaló correctamente"
    exit 1
fi

print_success "Node.js $(node -v) + pnpm $(pnpm -v) instalados"

# ==============================================================================
# PASO 3: Configurar PostgreSQL
# ==============================================================================
print_step "3/8 Configurando PostgreSQL"

systemctl enable postgresql 2>/dev/null
systemctl start postgresql

if ! systemctl is-active --quiet postgresql; then
    print_error "PostgreSQL no se pudo iniciar"
    echo "  Revisa: journalctl -u postgresql -n 20"
    exit 1
fi

if [ "$IS_UPDATE" = false ]; then
    DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    SESSION_SECRET=$(openssl rand -base64 32)

    print_status "Creando usuario de base de datos '$DB_USER'..."
    sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
        sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null

    print_status "Creando base de datos '$DB_NAME'..."
    sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
        sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null

    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null
    sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_USER;" 2>/dev/null

    PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file;" | tr -d ' ')
    if [ -n "$PG_HBA" ] && [ -f "$PG_HBA" ]; then
        if ! grep -q "$DB_USER" "$PG_HBA" 2>/dev/null; then
            print_status "Configurando autenticación PostgreSQL (md5)..."
            sed -i "/^# IPv4 local connections:/a host    $DB_NAME    $DB_USER    127.0.0.1/32    md5" "$PG_HBA"
            sed -i "/^# \"local\" is for Unix/a local   $DB_NAME    $DB_USER                    md5" "$PG_HBA"
            systemctl reload postgresql
        fi
    fi

    print_success "Base de datos '$DB_NAME' creada con usuario '$DB_USER'"
else
    DB_PASS="$EXISTING_DB_PASS"
    SESSION_SECRET="$EXISTING_SESSION_SECRET"
    print_status "Usando credenciales de base de datos existentes"
fi

DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"

print_status "Verificando conexión a PostgreSQL..."
if PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h localhost -d "$DB_NAME" -c "SELECT 1;" &>/dev/null; then
    print_success "Conexión a PostgreSQL verificada"
else
    print_warning "No se pudo verificar la conexión. Se continuará de todas formas."
fi

# ==============================================================================
# PASO 4: Crear usuario del sistema
# ==============================================================================
print_step "4/8 Configurando usuario del sistema"

if id "$APP_USER" &>/dev/null; then
    print_status "Usuario '$APP_USER' ya existe"
else
    useradd --system --create-home --shell /bin/bash "$APP_USER"
    print_success "Usuario '$APP_USER' creado"
fi

# ==============================================================================
# PASO 5: Clonar/actualizar código fuente
# ==============================================================================
print_step "5/8 Descargando código fuente"

git config --global --add safe.directory "$APP_DIR" 2>/dev/null

if [ -d "$APP_DIR/.git" ]; then
    print_status "Repositorio existente detectado. Actualizando..."
    cd "$APP_DIR"
    sudo -u "$APP_USER" git fetch origin 2>&1 | tail -2
    sudo -u "$APP_USER" git reset --hard origin/main 2>&1 | tail -2
    print_success "Código actualizado desde GitHub"
else
    print_status "Clonando repositorio desde GitHub..."
    mkdir -p /var/www
    git clone --depth 1 "$GITHUB_REPO" "$APP_DIR" 2>&1 | tail -3
    print_success "Repositorio clonado en $APP_DIR"
fi

mkdir -p "$UPLOAD_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ==============================================================================
# PASO 6: Configuración persistente
# ==============================================================================
print_step "6/8 Guardando configuración"

mkdir -p "$CONFIG_DIR"

if [ "$IS_UPDATE" = false ]; then
    echo ""
    echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║             CONFIGURACIÓN DE DOMINIOS                     ║${NC}"
    echo -e "${YELLOW}╠═══════════════════════════════════════════════════════════╣${NC}"
    echo -e "${YELLOW}║  El panel admin necesita un dominio (o subdominio) para   ║${NC}"
    echo -e "${YELLOW}║  diferenciarlo de los dominios de los autores.            ║${NC}"
    echo -e "${YELLOW}║                                                           ║${NC}"
    echo -e "${YELLOW}║  Ejemplos: admin.tuempresa.com, panel.tudominio.com       ║${NC}"
    echo -e "${YELLOW}║  Si solo usarás la IP, presiona Enter.                    ║${NC}"
    echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    read -p "  Dominio del panel admin (Enter para omitir): " ADMIN_DOMAIN
    ADMIN_DOMAIN=$(echo "$ADMIN_DOMAIN" | tr -d ' ' | tr '[:upper:]' '[:lower:]')

    echo ""
    echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║          CONTRASEÑA DEL PANEL DE ADMINISTRACIÓN           ║${NC}"
    echo -e "${YELLOW}╠═══════════════════════════════════════════════════════════╣${NC}"
    echo -e "${YELLOW}║  Establece una contraseña para proteger el acceso al      ║${NC}"
    echo -e "${YELLOW}║  panel de administración de ASD Funnel.                   ║${NC}"
    echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    while true; do
        read -sp "  Contraseña de administración: " ADMIN_PASS
        echo ""
        read -sp "  Confirmar contraseña: " ADMIN_PASS2
        echo ""
        if [ "$ADMIN_PASS" = "$ADMIN_PASS2" ] && [ -n "$ADMIN_PASS" ]; then
            break
        fi
        print_error "Las contraseñas no coinciden o están vacías. Inténtalo de nuevo."
    done
    ADMIN_PASSWORD_HASH=$(node -e "
      const crypto = require('crypto');
      const salt = crypto.randomBytes(16).toString('hex');
      crypto.scrypt(process.argv[1], salt, 64, (err, key) => {
        process.stdout.write(salt + ':' + key.toString('hex'));
      });
    " "$ADMIN_PASS")
    print_success "Contraseña configurada"

    cat > "$CONFIG_DIR/env" << EOF
NODE_ENV=production
PORT=$APP_PORT
DATABASE_URL=$DATABASE_URL
SESSION_SECRET=$SESSION_SECRET
UPLOAD_DIR=$UPLOAD_DIR
APP_BASE_URL=http://localhost:$APP_PORT
ADMIN_DOMAIN=$ADMIN_DOMAIN
ADMIN_PASSWORD_HASH=$ADMIN_PASSWORD_HASH
SECURE_COOKIES=false
EOF
    print_success "Configuración inicial creada"
else
    grep -q "^UPLOAD_DIR=" "$CONFIG_DIR/env" || echo "UPLOAD_DIR=$UPLOAD_DIR" >> "$CONFIG_DIR/env"
    grep -q "^APP_BASE_URL=" "$CONFIG_DIR/env" || echo "APP_BASE_URL=http://localhost:$APP_PORT" >> "$CONFIG_DIR/env"
    grep -q "^ADMIN_DOMAIN=" "$CONFIG_DIR/env" || echo "ADMIN_DOMAIN=" >> "$CONFIG_DIR/env"
    grep -q "^SECURE_COOKIES=" "$CONFIG_DIR/env" || echo "SECURE_COOKIES=false" >> "$CONFIG_DIR/env"
    ADMIN_DOMAIN=$(grep -E '^ADMIN_DOMAIN=' "$CONFIG_DIR/env" | cut -d= -f2-)

    if ! grep -q "^ADMIN_PASSWORD_HASH=" "$CONFIG_DIR/env"; then
        echo ""
        echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
        echo -e "${YELLOW}║          CONTRASEÑA DEL PANEL DE ADMINISTRACIÓN           ║${NC}"
        echo -e "${YELLOW}╠═══════════════════════════════════════════════════════════╣${NC}"
        echo -e "${YELLOW}║  No se encontró contraseña configurada. Establece una     ║${NC}"
        echo -e "${YELLOW}║  para proteger el acceso al panel.                        ║${NC}"
        echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"
        echo ""
        while true; do
            read -sp "  Contraseña de administración: " ADMIN_PASS
            echo ""
            read -sp "  Confirmar contraseña: " ADMIN_PASS2
            echo ""
            if [ "$ADMIN_PASS" = "$ADMIN_PASS2" ] && [ -n "$ADMIN_PASS" ]; then
                break
            fi
            print_error "Las contraseñas no coinciden o están vacías. Inténtalo de nuevo."
        done
        ADMIN_PASSWORD_HASH=$(node -e "
          const crypto = require('crypto');
          const salt = crypto.randomBytes(16).toString('hex');
          crypto.scrypt(process.argv[1], salt, 64, (err, key) => {
            process.stdout.write(salt + ':' + key.toString('hex'));
          });
        " "$ADMIN_PASS")
        echo "ADMIN_PASSWORD_HASH=$ADMIN_PASSWORD_HASH" >> "$CONFIG_DIR/env"
        print_success "Contraseña configurada"
    fi

    print_status "Configuración existente preservada y actualizada"
fi

chmod 755 "$CONFIG_DIR"
chmod 644 "$CONFIG_DIR/env"
chown root:root "$CONFIG_DIR/env"

print_success "Configuración guardada en $CONFIG_DIR/env"

# ==============================================================================
# PASO 7: Build de la aplicación
# ==============================================================================
print_step "7/8 Compilando aplicación (esto puede tardar unos minutos)"

cd "$APP_DIR"

export PORT=$APP_PORT
export BASE_PATH="/"
export DATABASE_URL="$DATABASE_URL"

print_status "Instalando dependencias Node.js (pnpm install)..."
sudo -u "$APP_USER" -E env NODE_ENV=development HOME="/home/$APP_USER" pnpm install --no-frozen-lockfile 2>&1 | tail -5
print_success "Dependencias instaladas"

print_status "Compilando typecheck de librerías compartidas..."
sudo -u "$APP_USER" -E env NODE_ENV=production HOME="/home/$APP_USER" pnpm run typecheck:libs 2>&1 | tail -5
print_success "Librerías verificadas"

print_status "Compilando frontend (React + Vite)..."
sudo -u "$APP_USER" -E env NODE_ENV=production HOME="/home/$APP_USER" pnpm --filter @workspace/lennox-admin run build 2>&1 | tail -5
print_success "Frontend compilado"

print_status "Compilando backend (Express + esbuild)..."
sudo -u "$APP_USER" -E env NODE_ENV=production HOME="/home/$APP_USER" pnpm --filter @workspace/api-server run build 2>&1 | tail -5
print_success "Backend compilado"

print_status "Sincronizando esquema de base de datos (Drizzle ORM)..."
sudo -u "$APP_USER" -E env HOME="/home/$APP_USER" DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/db run push-force 2>&1 | tail -5
print_success "Esquema de base de datos sincronizado"

print_success "Aplicación compilada correctamente"

# ==============================================================================
# PASO 8: Servicios (systemd + Nginx)
# ==============================================================================
print_step "8/8 Configurando servicios del sistema"

# ─── Servicio systemd ────────────────────────────────────────────────────────
print_status "Creando servicio systemd..."

cat > "/etc/systemd/system/$APP_NAME.service" << EOF
[Unit]
Description=ASD Funnel - Panel de Gestión Editorial (Atreyu Servicios Digitales)
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
Environment=HOME=/home/$APP_USER

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$APP_NAME" 2>/dev/null
print_success "Servicio systemd '$APP_NAME' configurado"

# ─── Nginx ───────────────────────────────────────────────────────────────────
print_status "Configurando Nginx como proxy reverso multi-dominio..."

FRONTEND_DIR="$APP_DIR/artifacts/lennox-admin/dist/public"

PROXY_BLOCK='
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection '"'"'upgrade'"'"';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
'

cat > "/etc/nginx/sites-available/$APP_NAME" << NGINX
# ──────────────────────────────────────────────────────────────────────────────
# Servidor principal: Panel Admin + API
# Dominio admin: ${ADMIN_DOMAIN:-"(por IP)"}
# Todo dominio NO reconocido como autor → panel admin
# ──────────────────────────────────────────────────────────────────────────────
server {
    listen 80 default_server;
    server_name _;

    client_max_body_size 50M;

    root $FRONTEND_DIR;
    index index.html;

    # API proxy → Node.js backend
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

    # Frontend SPA (panel admin)
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache de assets estáticos (30 días)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}

# ──────────────────────────────────────────────────────────────────────────────
# Dominios de autores → Landing pages públicas
# Cualquier dominio que NO sea el del admin se envía a Node.js,
# que detecta el dominio del autor via el header Host y sirve la landing.
# Para añadir un dominio de autor: solo apunta su DNS a esta IP.
# ──────────────────────────────────────────────────────────────────────────────
# NOTA: Cuando configures dominios de autores, añade un bloque server aquí:
#
# server {
#     listen 80;
#     server_name elizabethblack.com www.elizabethblack.com;
#     client_max_body_size 50M;
#     location / {
#         proxy_pass http://127.0.0.1:$APP_PORT;
#         proxy_http_version 1.1;
#         proxy_set_header Host \$host;
#         proxy_set_header X-Real-IP \$remote_addr;
#         proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
#         proxy_set_header X-Forwarded-Proto \$scheme;
#     }
# }
#
# O usa el script: sudo bash $APP_DIR/add-author-domain.sh elizabethblack.com
NGINX

ln -sf "/etc/nginx/sites-available/$APP_NAME" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

if nginx -t 2>/dev/null; then
    print_success "Configuración de Nginx válida"
else
    print_error "Error en configuración de Nginx. Revisa: nginx -t"
fi

systemctl enable nginx 2>/dev/null
systemctl restart nginx
print_success "Nginx configurado y activo"

# ─── Firewall (UFW) ─────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    print_status "Configurando firewall (UFW)..."
    ufw allow 22/tcp   2>/dev/null || true
    ufw allow 80/tcp   2>/dev/null || true
    ufw allow 443/tcp  2>/dev/null || true
    ufw --force enable 2>/dev/null || true
    print_success "Firewall configurado (puertos 22, 80, 443 abiertos)"
fi

# ─── Iniciar aplicación ─────────────────────────────────────────────────────
print_status "Iniciando ASD Funnel..."
systemctl restart "$APP_NAME"
sleep 4

if systemctl is-active --quiet "$APP_NAME"; then
    print_success "Servicio $APP_NAME iniciado correctamente"
else
    print_error "El servicio no arrancó correctamente"
    echo ""
    echo "  Diagnóstico:"
    echo "    journalctl -u $APP_NAME -n 30 --no-pager"
    echo ""
    journalctl -u "$APP_NAME" -n 10 --no-pager 2>/dev/null || true
fi

# ==============================================================================
# CLOUDFLARE TUNNEL (Opcional)
# ==============================================================================
echo ""
echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║             CLOUDFLARE TUNNEL (Opcional)                  ║${NC}"
echo -e "${YELLOW}╠═══════════════════════════════════════════════════════════╣${NC}"
echo -e "${YELLOW}║  Si deseas exponer la app a Internet con HTTPS gratuito  ║${NC}"
echo -e "${YELLOW}║  mediante Cloudflare Tunnel, introduce el token aquí.    ║${NC}"
echo -e "${YELLOW}║  Si solo necesitas acceso en red local, presiona Enter.  ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
read -p "  Token de Cloudflare Tunnel (Enter para omitir): " CF_TOKEN

if [ -n "$CF_TOKEN" ]; then
    print_status "Descargando e instalando Cloudflare Tunnel..."
    curl -L -o /tmp/cloudflared.deb \
        https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb 2>/dev/null
    dpkg -i /tmp/cloudflared.deb 2>/dev/null
    rm -f /tmp/cloudflared.deb

    cloudflared service install "$CF_TOKEN" 2>/dev/null
    systemctl enable cloudflared 2>/dev/null
    systemctl start cloudflared

    sed -i 's/SECURE_COOKIES=false/SECURE_COOKIES=true/' "$CONFIG_DIR/env"
    systemctl restart "$APP_NAME"

    if systemctl is-active --quiet cloudflared; then
        print_success "Cloudflare Tunnel activo (HTTPS habilitado, cookies seguras activadas)"
    else
        print_warning "Cloudflare Tunnel instalado pero no activo. Revisa: systemctl status cloudflared"
    fi

    echo ""
    echo -e "  ${YELLOW}IMPORTANTE:${NC} Actualiza APP_BASE_URL con tu dominio:"
    echo "    sudo sed -i 's|APP_BASE_URL=.*|APP_BASE_URL=https://tudominio.com|' $CONFIG_DIR/env"
    echo "    sudo systemctl restart $APP_NAME"
fi

# ==============================================================================
# RESUMEN FINAL
# ==============================================================================
SERVER_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}${BOLD}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           INSTALACIÓN COMPLETADA CON ÉXITO                ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
if [ -n "$ADMIN_DOMAIN" ]; then
    echo -e "  ${BOLD}Panel admin:${NC}       http://$ADMIN_DOMAIN"
else
    echo -e "  ${BOLD}Panel admin:${NC}       http://$SERVER_IP"
fi
echo ""
echo -e "  ${BOLD}Detalles:${NC}"
echo "    Aplicación:     $APP_DIR"
echo "    Configuración:  $CONFIG_DIR/env"
echo "    Uploads:        $UPLOAD_DIR"
echo "    Base de datos:  PostgreSQL → $DB_NAME"
echo "    Dominio admin:  ${ADMIN_DOMAIN:-"(acceso por IP)"}"
echo "    Puerto API:     $APP_PORT (detrás de Nginx)"
echo ""
echo -e "  ${BOLD}Servicios activos:${NC}"
echo "    ● asdfunnel     (aplicación Node.js)"
echo "    ● nginx         (proxy reverso, puerto 80)"
echo "    ● postgresql    (base de datos)"
if [ -n "$CF_TOKEN" ]; then
    echo "    ● cloudflared   (túnel HTTPS)"
fi
echo ""
echo -e "  ${BOLD}Seguridad:${NC}"
echo "    El panel está protegido por contraseña."
echo "    Cambiar contraseña:  sudo bash $APP_DIR/change-password.sh"
echo ""
echo -e "  ${BOLD}Comandos útiles:${NC}"
echo "    Estado:         sudo systemctl status $APP_NAME"
echo "    Logs:           sudo journalctl -u $APP_NAME -f"
echo "    Reiniciar:      sudo systemctl restart $APP_NAME"
echo "    Detener:        sudo systemctl stop $APP_NAME"
echo "    Ver config:     sudo cat $CONFIG_DIR/env"
echo "    Backup BD:      sudo -u postgres pg_dump $DB_NAME > backup.sql"
echo ""
echo -e "  ${BOLD}Añadir dominio de autor:${NC}"
echo "    sudo bash $APP_DIR/add-author-domain.sh midominio.com"
echo ""
echo -e "  ${YELLOW}Para actualizar en el futuro:${NC}"
echo "    sudo bash $APP_DIR/install.sh"
echo ""
echo -e "  ${BOLD}Arquitectura multi-dominio:${NC}"
echo "    ● Panel admin:  acceso por IP o dominio admin configurado"
echo "    ● Autores:      cada autor puede tener su propio dominio"
echo "    ● Todos los dominios apuntan a la misma IP del servidor"
echo "    ● Node.js detecta el dominio y sirve la landing page correcta"
echo ""
