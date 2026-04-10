# ASD FUNNEL

**Panel de Gestión Editorial Automatizado** por [Atreyu Servicios Digitales](https://atreyu.es)

Sistema completo de gestión de publicaciones digitales para thrillers psicológicos. Gestiona autores, series, libros, landing pages multilenguaje, email marketing con doble opt-in, y 6 automatizaciones IA. Distribución amplia vía Draft2Digital (D2D).

---

## Tabla de Contenidos

- [Requisitos](#requisitos)
- [Instalacion Rapida](#instalacion-rapida)
- [Instalacion Manual](#instalacion-manual)
- [Configuracion](#configuracion)
- [Arquitectura](#arquitectura)
- [Funcionalidades](#funcionalidades)
- [Automatizaciones IA](#automatizaciones-ia)
- [Modelo de Distribucion](#modelo-de-distribucion)
- [Comandos de Administracion](#comandos-de-administracion)
- [Actualizacion](#actualizacion)
- [Cloudflare Tunnel](#cloudflare-tunnel)
- [Solucion de Problemas](#solucion-de-problemas)
- [Stack Tecnologico](#stack-tecnologico)

---

## Requisitos

- **Sistema operativo:** Ubuntu 22.04 o 24.04 (64-bit)
- **RAM:** 2 GB minimo (4 GB recomendado)
- **Disco:** 10 GB libres
- **Acceso root** (sudo)
- **Conexion a Internet** (para descargar dependencias)

---

## Instalacion Rapida

Ejecuta el script autoinstalador como root:

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/atreyu1968/ASDFunnel/main/install.sh)"
```

O si ya tienes el repositorio clonado:

```bash
cd /var/www/asdfunnel
sudo bash install.sh
```

El instalador:
1. Instala Node.js 20, pnpm, PostgreSQL y Nginx
2. Crea la base de datos y usuario dedicado
3. Compila frontend y backend
4. Configura systemd para auto-inicio
5. Configura Nginx como proxy reverso
6. Opcionalmente instala Cloudflare Tunnel

---

## Instalacion Manual

Si prefieres instalar paso a paso:

### 1. Dependencias del sistema

```bash
sudo apt update
sudo apt install -y curl git build-essential nginx postgresql postgresql-contrib

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
sudo chmod 755 /usr/bin/node /usr/bin/npm

# pnpm
sudo npm install -g pnpm@9
```

### 2. Base de datos

```bash
# Crear usuario y base de datos
sudo -u postgres psql -c "CREATE USER asdfunnel WITH PASSWORD 'tu_contraseña_segura';"
sudo -u postgres psql -c "CREATE DATABASE asdfunnel OWNER asdfunnel;"

# Asegurar acceso por contraseña en pg_hba.conf
# Agregar: local asdfunnel asdfunnel md5
sudo systemctl reload postgresql
```

### 3. Codigo fuente

```bash
sudo mkdir -p /var/www
sudo git clone https://github.com/atreyu1968/ASDFunnel.git /var/www/asdfunnel
cd /var/www/asdfunnel
```

### 4. Configuracion

```bash
sudo mkdir -p /etc/asdfunnel
sudo cat > /etc/asdfunnel/env << EOF
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://asdfunnel:tu_contraseña_segura@localhost:5432/asdfunnel
SESSION_SECRET=$(openssl rand -base64 32)
UPLOAD_DIR=/var/www/asdfunnel/uploads
APP_BASE_URL=http://tu-dominio.com
SECURE_COOKIES=false
EOF
sudo chmod 600 /etc/asdfunnel/env
```

### 5. Compilar

```bash
# Variables necesarias para el build
export NODE_ENV=production PORT=5000 BASE_PATH="/"
export DATABASE_URL="postgresql://asdfunnel:tu_contraseña_segura@localhost:5432/asdfunnel"

# Instalar dependencias
pnpm install --frozen-lockfile

# Compilar frontend
pnpm --filter @workspace/lennox-admin run build

# Compilar backend
pnpm --filter @workspace/api-server run build

# Sincronizar esquema de BD
pnpm --filter @workspace/db run push
```

### 6. Servicio systemd

```bash
sudo cat > /etc/systemd/system/asdfunnel.service << EOF
[Unit]
Description=ASD Funnel - Panel de Gestion Editorial
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=asdfunnel
WorkingDirectory=/var/www/asdfunnel/artifacts/api-server
EnvironmentFile=/etc/asdfunnel/env
ExecStart=/usr/bin/node --enable-source-maps ./dist/index.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable asdfunnel
sudo systemctl start asdfunnel
```

### 7. Nginx

```bash
# Ver ejemplo completo en install.sh
sudo systemctl enable nginx
sudo systemctl restart nginx
```

---

## Configuracion

La configuracion se almacena en `/etc/asdfunnel/env` (fuera del repositorio para no perderse en actualizaciones).

### Variables de Entorno

| Variable | Descripcion | Ejemplo |
|----------|-------------|---------|
| `NODE_ENV` | Entorno de ejecucion | `production` |
| `PORT` | Puerto del servidor API | `5000` |
| `DATABASE_URL` | Conexion PostgreSQL | `postgresql://user:pass@localhost:5432/asdfunnel` |
| `SESSION_SECRET` | Secreto para sesiones | (generado automaticamente) |
| `UPLOAD_DIR` | Directorio de archivos subidos | `/var/www/asdfunnel/uploads` |
| `APP_BASE_URL` | URL publica de la aplicacion | `https://tudominio.com` |
| `SECURE_COOKIES` | Cookies seguras (requiere HTTPS) | `false` o `true` |

### Configuracion desde el Panel

Desde **Configuracion** en el panel de administracion puedes configurar:
- **Proveedor de email:** API key de Resend, direccion y nombre del remitente
- **Inteligencia Artificial:** Proveedor (DeepSeek/OpenAI), modelo y API key

---

## Arquitectura

```
ASD Funnel
├── artifacts/
│   ├── api-server/          # Backend Express (API REST)
│   │   ├── src/
│   │   │   ├── routes/      # Endpoints CRUD + AI + storage
│   │   │   └── lib/         # Utilidades (AI, storage, email)
│   │   └── dist/            # Bundle produccion (esbuild)
│   └── lennox-admin/        # Frontend React SPA
│       ├── src/
│       │   ├── pages/       # Paginas del admin
│       │   └── components/  # Componentes UI (shadcn/ui)
│       └── dist/public/     # Build produccion (Vite)
├── lib/
│   ├── db/                  # Esquema PostgreSQL (Drizzle ORM)
│   ├── api-spec/            # Especificacion OpenAPI + codegen
│   ├── api-client-react/    # Hooks React Query (generados)
│   └── api-zod/             # Validadores Zod (generados)
├── install.sh               # Autoinstalador Ubuntu
└── README.md
```

### Produccion (Ubuntu)

```
Internet → [Cloudflare Tunnel] → Nginx (puerto 80)
                                    ├── /api/* → Node.js (puerto 5000)
                                    └── /* → archivos estaticos (SPA)
```

---

## Funcionalidades

### Panel de Control
- Dashboard con estadisticas generales
- Progreso de series activas
- Actividad reciente

### Gestion de Contenidos
- **Autores:** Nombres de pluma, biografias, dominios web propios
- **Series:** Series de libros con seguimiento de estado
- **Libros:** Catalogo completo con roles de embudo, precios, portadas, manuscritos y enlaces Books2Read

### Embudo de Ventas (Funnel)
Visualizacion multi-etapa del flujo de lectores:
1. **Lead Magnet** - Libros gratuitos para captar emails
2. **Entrada de Trafico** - Libro 1 a precio reducido via D2D
3. **Oferta Principal** - Libros a precio completo (monetizacion)
4. **Puente Crossover** - Transferencia entre series/autores

### Calendario Rapid Release
Calendario visual de publicaciones programadas por serie.

### Email Marketing
- **Listas de correo** por autor e idioma con estadisticas
- **Suscriptores** con busqueda, filtros y gestion de estados
- **Plantillas de email** (bienvenida, lead magnet, newsletter) con editor HTML/texto
- **Captacion con doble opt-in** (confirmacion por email)

### Landing Pages
- Paginas multilenguaje con metadata SEO
- Vinculadas a autores, series o libros
- Generacion automatica de URL desde dominio del autor
- Jerarquia autor ↔ series ↔ libros

### Automatizaciones
Constructor de reglas trigger/accion:
- Trigger: nuevo suscriptor, confirmacion, etc.
- Acciones: enviar email, asignar etiqueta, mover a lista

### Almacenamiento
- Subida de portadas e imagenes (max 50MB)
- Carga de manuscritos .docx con generacion automatica de landing page
- Almacenamiento local en produccion (GCS en Replit)

---

## Automatizaciones IA

El sistema incluye 6 automatizaciones potenciadas por IA (DeepSeek o OpenAI):

| Automatizacion | Descripcion | Endpoint |
|----------------|-------------|----------|
| **Generacion de Emails** | Genera plantillas completas (asunto, HTML, texto) desde contexto del libro | `POST /api/ai/generate-email` |
| **Auto-Traduccion** | Traduce landing pages y plantillas de email entre 6 idiomas | `POST /api/ai/translate` |
| **Ficha Editorial D2D** | Genera descripcion de tiendas, contraportada, tagline, keywords, BISAC | `POST /api/ai/generate-kdp` |
| **Secuencias Nurturing** | Genera cadenas de 2-10 emails de nutricion con programacion | `POST /api/ai/generate-sequence` |
| **Lineas de Asunto A/B** | Genera variantes de asunto para testing A/B | `POST /api/ai/generate-subjects` |
| **Resumen de Serie** | Genera descripcion, tagline y orden de lectura de la serie | `POST /api/ai/generate-series-summary` |

### Idiomas soportados
Espanol (ES), Ingles (EN), Frances (FR), Aleman (DE), Italiano (IT), Portugues (PT)

### Configuracion de IA
Desde el panel de administracion > Configuracion:
1. Selecciona el proveedor (DeepSeek o OpenAI)
2. Introduce tu API key
3. Opcionalmente cambia el modelo

---

## Modelo de Distribucion

ASD Funnel esta disenado para **distribucion amplia (wide)** mediante **Draft2Digital (D2D)**:

- **Amazon** (Kindle Store)
- **Apple Books**
- **Kobo**
- **Barnes & Noble** (Nook)
- **Google Play Books**

Cada libro puede incluir un **enlace universal Books2Read** (`https://books2read.com/...`) que permite a los lectores elegir su tienda preferida.

> **Nota:** Este sistema NO usa KDP Select / Kindle Unlimited. La estrategia es distribucion amplia para maximizar el alcance.

---

## Comandos de Administracion

### Servicio de la aplicacion

```bash
# Estado
sudo systemctl status asdfunnel

# Logs en tiempo real
sudo journalctl -u asdfunnel -f

# Reiniciar
sudo systemctl restart asdfunnel

# Detener
sudo systemctl stop asdfunnel

# Iniciar
sudo systemctl start asdfunnel
```

### Base de datos

```bash
# Conectar a la base de datos
sudo -u postgres psql asdfunnel

# Backup
sudo -u postgres pg_dump asdfunnel > backup_$(date +%Y%m%d).sql

# Restaurar
sudo -u postgres psql asdfunnel < backup.sql
```

### Nginx

```bash
# Estado
sudo systemctl status nginx

# Recargar configuracion
sudo nginx -t && sudo systemctl reload nginx

# Logs de acceso
sudo tail -f /var/log/nginx/access.log

# Logs de error
sudo tail -f /var/log/nginx/error.log
```

### Verificar puertos

```bash
# Ver puertos en uso
ss -ltnp | grep -E ':(80|5000|5432)'

# Probar conexion local
curl http://localhost:5000/api/health
```

---

## Actualizacion

Para actualizar a la ultima version:

```bash
sudo bash /var/www/asdfunnel/install.sh
```

El script detecta automaticamente que es una actualizacion y:
- Preserva las credenciales de base de datos
- Preserva la configuracion existente
- Actualiza el codigo fuente
- Recompila frontend y backend
- Sincroniza el esquema de BD (sin perder datos)
- Reinicia los servicios

---

## Cloudflare Tunnel

Para exponer la aplicacion a Internet con HTTPS gratuito:

### Durante la instalacion
El instalador pregunta por el token de Cloudflare Tunnel al final.

### Post-instalacion

```bash
# Instalar cloudflared
curl -L -o /tmp/cloudflared.deb \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb

# Configurar con token
sudo cloudflared service install "TU_TOKEN_AQUI"
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# Habilitar cookies seguras
sudo sed -i 's/SECURE_COOKIES=false/SECURE_COOKIES=true/' /etc/asdfunnel/env

# Actualizar APP_BASE_URL con tu dominio
sudo sed -i 's|APP_BASE_URL=.*|APP_BASE_URL=https://tudominio.com|' /etc/asdfunnel/env

sudo systemctl restart asdfunnel
```

### Obtener el token
1. Accede a [Cloudflare Zero Trust](https://one.dash.cloudflare.com)
2. Ve a **Networks > Tunnels**
3. Crea un tunnel nuevo
4. Configura el hostname apuntando a `http://localhost:80`
5. Copia el token de instalacion

---

## Solucion de Problemas

| Problema | Causa probable | Solucion |
|----------|---------------|----------|
| La app no carga | Servicio caido | `sudo systemctl restart asdfunnel` |
| Error 502 en Nginx | El API server no responde | Verificar logs: `journalctl -u asdfunnel -n 50` |
| No se guardan sesiones | Cookies `secure:true` sin HTTPS | Verificar `SECURE_COOKIES=false` en `/etc/asdfunnel/env` |
| Error de base de datos | Credenciales incorrectas | Verificar `DATABASE_URL` en `/etc/asdfunnel/env` |
| Subida de archivos falla | Permisos en directorio uploads | `sudo chown -R asdfunnel:asdfunnel /var/www/asdfunnel/uploads` |
| Error 521 en Cloudflare | Tunnel no conectado | `sudo systemctl restart cloudflared` |
| Pagina en blanco | Frontend no compilado | `sudo bash /var/www/asdfunnel/install.sh` |
| AI no funciona | API key no configurada | Configurar desde panel > Configuracion > IA |

### Logs utiles

```bash
# Logs de la aplicacion
sudo journalctl -u asdfunnel --since "1 hour ago"

# Logs de Nginx
sudo tail -20 /var/log/nginx/error.log

# Logs de PostgreSQL
sudo journalctl -u postgresql --since "1 hour ago"

# Verificar configuracion
sudo cat /etc/asdfunnel/env
```

---

## Stack Tecnologico

| Componente | Tecnologia |
|-----------|------------|
| **Frontend** | React 19, Vite 7, Tailwind CSS 4, shadcn/ui |
| **Backend** | Express 5, Node.js 20, TypeScript 5.9 |
| **Base de datos** | PostgreSQL + Drizzle ORM |
| **Email** | Resend |
| **IA** | DeepSeek / OpenAI (configurable) |
| **Build** | esbuild (backend), Vite (frontend) |
| **Monorepo** | pnpm workspaces |
| **Proceso** | systemd |
| **Proxy** | Nginx |
| **Tunnel** | Cloudflare (opcional) |

---

## Licencia

MIT

---

*Desarrollado por [Atreyu Servicios Digitales](https://atreyu.es)*
