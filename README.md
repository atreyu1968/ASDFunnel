# ASD FUNNEL

**Panel de Gestion Editorial Automatizado** por [Atreyu Servicios Digitales](https://atreyu.es)

Sistema completo de gestion de publicaciones digitales para thrillers psicologicos. Gestiona autores, series, libros, landing pages multilenguaje, email marketing con doble opt-in, corrector editorial IA de 14 fases, y 8 automatizaciones IA. Distribucion amplia via Draft2Digital (D2D).

---

## Tabla de Contenidos

- [Requisitos](#requisitos)
- [Instalacion Rapida](#instalacion-rapida)
- [Actualizacion](#actualizacion)
- [Instalacion Manual](#instalacion-manual)
- [Configuracion](#configuracion)
- [Seguridad](#seguridad)
- [Arquitectura](#arquitectura)
- [Funcionalidades](#funcionalidades)
- [Automatizaciones IA](#automatizaciones-ia)
- [Corrector Editorial IA](#corrector-editorial-ia)
- [Modelo de Distribucion](#modelo-de-distribucion)
- [Comandos de Administracion](#comandos-de-administracion)
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

En un **servidor Ubuntu recien instalado**, ejecuta estos 2 comandos:

```bash
apt-get update && apt-get install -y curl
curl -fsSL https://raw.githubusercontent.com/atreyu1968/ASDFunnel/main/install.sh -o /tmp/install.sh && bash /tmp/install.sh
```

El script se encarga de **todo** automaticamente:
1. Actualiza el sistema e instala paquetes base
2. Instala Node.js 20 y pnpm 9
3. Instala y configura PostgreSQL (crea usuario y base de datos)
4. Clona el repositorio desde GitHub
5. Pide dominio del panel y **contrasena de administracion**
6. Compila frontend (React + Vite) y backend (Express + esbuild)
7. Sincroniza el esquema de base de datos (Drizzle ORM)
8. Configura systemd para auto-inicio y auto-reinicio
9. Configura Nginx como proxy reverso (puerto 80)
10. Configura firewall (UFW) abriendo solo puertos 22, 80, 443
11. Opcionalmente instala Cloudflare Tunnel para HTTPS gratuito

---

## Actualizacion

Para actualizar a la ultima version:

```bash
sudo bash /var/www/asdfunnel/install.sh
```

El script detecta automaticamente que es una actualizacion y:
- Preserva las credenciales de base de datos
- Preserva la configuracion y contrasena existentes
- Si no hay contrasena configurada, la pide
- Actualiza el codigo fuente desde GitHub
- Recompila frontend y backend (sin compilar componentes innecesarios)
- Sincroniza el esquema de BD (sin perder datos)
- Reinicia los servicios

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
sudo -u postgres psql -c "CREATE USER asdfunnel WITH PASSWORD 'tu_contrasena_segura';"
sudo -u postgres psql -c "CREATE DATABASE asdfunnel OWNER asdfunnel;"
sudo -u postgres psql -d asdfunnel -c "GRANT ALL ON SCHEMA public TO asdfunnel;"
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

# Generar hash de contrasena
read -sp "Contrasena admin: " PASS && echo ""
HASH=$(node -e "
  const crypto = require('crypto');
  const salt = crypto.randomBytes(16).toString('hex');
  crypto.scrypt(process.argv[1], salt, 64, (err, key) => {
    process.stdout.write(salt + ':' + key.toString('hex'));
  });
" "$PASS")

sudo cat > /etc/asdfunnel/env << EOF
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://asdfunnel:tu_contrasena_segura@localhost:5432/asdfunnel
SESSION_SECRET=$(openssl rand -base64 32)
UPLOAD_DIR=/var/www/asdfunnel/uploads
APP_BASE_URL=http://tu-dominio.com
ADMIN_DOMAIN=tu-dominio.com
ADMIN_PASSWORD_HASH=$HASH
SECURE_COOKIES=false
EOF
sudo chmod 644 /etc/asdfunnel/env
```

### 5. Compilar

```bash
export PORT=5000 BASE_PATH="/"
export DATABASE_URL="postgresql://asdfunnel:tu_contrasena_segura@localhost:5432/asdfunnel"

# Instalar dependencias (con devDependencies para drizzle-kit)
NODE_ENV=development pnpm install --frozen-lockfile

# Compilar solo frontend y backend (NO compilar mockup-sandbox)
pnpm --filter @workspace/lennox-admin run build
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
# La configuracion de Nginx sirve:
# - /api/* -> proxy al backend Node.js (puerto 5000)
# - /* -> archivos estaticos del frontend (dist/public)
# Nota: el root de Nginx debe apuntar a dist/PUBLIC, no a dist/
# Root correcto: /var/www/asdfunnel/artifacts/lennox-admin/dist/public

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
| `ADMIN_DOMAIN` | Dominio del panel de administracion | `admin.tudominio.com` |
| `ADMIN_PASSWORD_HASH` | Hash de la contrasena de admin | (generado por install.sh) |
| `SECURE_COOKIES` | Cookies seguras (requiere HTTPS) | `false` o `true` |

### Configuracion desde el Panel

Desde **Configuracion** en el panel de administracion puedes configurar:
- **Proveedor de email:** API key de Resend, direccion y nombre del remitente
- **Inteligencia Artificial:** Proveedor (DeepSeek/OpenAI), modelo y API key

---

## Seguridad

El panel de administracion esta protegido por contrasena. Al acceder se muestra una pantalla de login.

### Cambiar contrasena

```bash
sudo bash /var/www/asdfunnel/change-password.sh
```

### Cerrar sesion

Desde el panel, usar el boton "Cerrar Sesion" en la parte inferior de la barra lateral.

### Notas de seguridad
- Las sesiones se almacenan en memoria del servidor (se pierden al reiniciar el servicio)
- La contrasena se almacena como hash scrypt en `/etc/asdfunnel/env`
- Las cookies de sesion son HttpOnly (no accesibles por JavaScript)
- Para HTTPS, configurar `SECURE_COOKIES=true` y usar Cloudflare Tunnel

---

## Arquitectura

```
ASD Funnel
├── artifacts/
│   ├── api-server/          # Backend Express 5 (API REST)
│   │   ├── src/
│   │   │   ├── routes/      # Endpoints CRUD + AI + auth + storage
│   │   │   ├── middleware/   # Auth middleware
│   │   │   └── lib/         # Utilidades (AI, storage, email)
│   │   └── dist/            # Bundle produccion (esbuild)
│   └── lennox-admin/        # Frontend React SPA
│       ├── src/
│       │   ├── pages/       # Paginas del admin (login, dashboard, etc.)
│       │   └── components/  # Componentes UI (shadcn/ui) + corrector editorial
│       └── dist/public/     # Build produccion (Vite)
├── lib/
│   ├── db/                  # Esquema PostgreSQL (Drizzle ORM)
│   ├── api-spec/            # Especificacion OpenAPI + codegen
│   ├── api-client-react/    # Hooks React Query (generados)
│   └── api-zod/             # Validadores Zod (generados)
├── install.sh               # Autoinstalador/actualizador Ubuntu
├── change-password.sh       # Cambiar contrasena de admin
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

### Autenticacion
- Login con contrasena para proteger el panel
- Sesiones seguras con cookies HttpOnly
- Boton de cerrar sesion

### Gestion de Contenidos
- **Autores:** Nombres de pluma, biografias, dominios web propios
- **Series:** Series de libros con seguimiento de estado y contexto para IA
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
- Jerarquia autor - series - libros

### Automatizaciones
Constructor de reglas trigger/accion:
- Trigger: nuevo suscriptor, confirmacion, etc.
- Acciones: enviar email, asignar etiqueta, mover a lista

### Almacenamiento
- Subida de portadas e imagenes (max 50MB)
- Carga de manuscritos .docx con generacion automatica de landing page
- Almacenamiento local en produccion

---

## Automatizaciones IA

El sistema incluye 8 automatizaciones potenciadas por IA (DeepSeek o OpenAI). Todas las automatizaciones incluyen contexto de la serie (personajes, trama) para mantener coherencia:

| Automatizacion | Descripcion | Endpoint |
|----------------|-------------|----------|
| **Generacion de Emails** | Genera plantillas completas (asunto, HTML, texto) desde contexto del libro | `POST /api/ai/generate-email` |
| **Auto-Traduccion** | Traduce landing pages y plantillas de email entre 6 idiomas | `POST /api/ai/translate` |
| **Ficha Editorial D2D** | Genera descripcion de tiendas, contraportada, tagline, keywords, BISAC | `POST /api/ai/generate-kdp` |
| **Secuencias Nurturing** | Genera cadenas de 2-10 emails de nutricion con programacion | `POST /api/ai/generate-sequence` |
| **Lineas de Asunto A/B** | Genera variantes de asunto para testing A/B | `POST /api/ai/generate-subjects` |
| **Resumen de Serie** | Genera descripcion, tagline y orden de lectura de la serie | `POST /api/ai/generate-series-summary` |
| **Corrector Editorial** | Auditor forense de 14 fases para manuscritos y plantillas | `POST /api/ai/proofread` |
| **Guia de Spin-off** | Genera guia para derivar nuevas series desde una existente | `POST /api/ai/generate-spinoff-guide` |

### Idiomas soportados
Espanol (ES), Ingles (EN), Frances (FR), Aleman (DE), Italiano (IT), Portugues (PT)

### Configuracion de IA
Desde el panel de administracion > Configuracion:
1. Selecciona el proveedor (DeepSeek o OpenAI)
2. Introduce tu API key
3. Opcionalmente cambia el modelo (deepseek-chat, gpt-4o, etc.)

---

## Corrector Editorial IA

El corrector editorial es un auditor forense de 14 fases que analiza texto en busca de defectos tipicos de texto generado por IA. Esta disponible en las paginas de Libros, Plantillas de Email y Landing Pages.

### Fases de analisis

**Grupo A - Critico (rojo)**
1. Dialogos superpuestos
2. Cortes a mitad de frase
3. Bucles de accion
4. Parrafos clonados
5. Cambios de perspectiva
6. Rupturas temporales
7. Personajes fantasma

**Grupo B - Medio (ambar)**
8. Cliches de IA
9. Sobre-explicacion emocional
10. Transiciones artificiales
11. Dialogo exposicion

**Grupo C - Editorial (azul)**
12. Ortotipografia RAE
13. Formato de dialogos
14. Coherencia lexica

La puntuacion maxima es 10. Si el corrector no encuentra defectos en texto generado por IA, la puntuacion se limita a 7 como medida de precaucion.

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
sudo systemctl status asdfunnel
sudo journalctl -u asdfunnel -f        # Logs en tiempo real
sudo systemctl restart asdfunnel
sudo systemctl stop asdfunnel
```

### Contrasena

```bash
sudo bash /var/www/asdfunnel/change-password.sh
```

### Base de datos

```bash
sudo -u postgres psql asdfunnel                           # Conectar
sudo -u postgres pg_dump asdfunnel > backup_$(date +%Y%m%d).sql  # Backup
sudo -u postgres psql asdfunnel < backup.sql              # Restaurar

# Sincronizar esquema despues de actualizar
export $(grep -v '^#' /etc/asdfunnel/env | xargs)
cd /var/www/asdfunnel && pnpm --filter @workspace/db run push
```

### Nginx

```bash
sudo systemctl status nginx
sudo nginx -t && sudo systemctl reload nginx
sudo tail -f /var/log/nginx/error.log
```

### Verificar puertos

```bash
ss -ltnp | grep -E ':(80|5000|5432)'
curl http://localhost:5000/api/health
```

### Dominios de autores

```bash
sudo bash /var/www/asdfunnel/add-author-domain.sh midominio.com
```

---

## Cloudflare Tunnel

Para exponer la aplicacion a Internet con HTTPS gratuito:

### Durante la instalacion
El instalador pregunta por el token de Cloudflare Tunnel al final.

### Post-instalacion

```bash
curl -L -o /tmp/cloudflared.deb \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb

sudo cloudflared service install "TU_TOKEN_AQUI"
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# Habilitar cookies seguras y actualizar dominio
sudo sed -i 's/SECURE_COOKIES=false/SECURE_COOKIES=true/' /etc/asdfunnel/env
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
| Error 502 en Nginx | El API server no responde | `journalctl -u asdfunnel -n 50` |
| Error 403 en Nginx | Root incorrecto | Verificar que apunta a `dist/public`, no `dist/` |
| No se guardan sesiones | Cookies `secure:true` sin HTTPS | Verificar `SECURE_COOKIES=false` en `/etc/asdfunnel/env` |
| Error de base de datos | Credenciales o esquema | `export $(grep -v '^#' /etc/asdfunnel/env \| xargs) && pnpm --filter @workspace/db run push` |
| Subida de archivos falla | Permisos en uploads | `sudo chown -R asdfunnel:asdfunnel /var/www/asdfunnel/uploads` |
| Error 521 en Cloudflare | Tunnel no conectado | `sudo systemctl restart cloudflared` |
| Pagina en blanco | Frontend no compilado | `sudo bash /var/www/asdfunnel/install.sh` |
| IA no funciona | API key no configurada | Panel > Configuracion > IA |
| No puedo guardar config | Esquema de BD desactualizado | Ejecutar `pnpm --filter @workspace/db run push` con DATABASE_URL exportado |
| Login no aparece | Falta ADMIN_PASSWORD_HASH | `sudo bash /var/www/asdfunnel/change-password.sh` |
| Build falla con PORT | mockup-sandbox no necesario | Compilar solo: `pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/lennox-admin run build` |

### Logs utiles

```bash
sudo journalctl -u asdfunnel --since "1 hour ago"
sudo tail -20 /var/log/nginx/error.log
sudo journalctl -u postgresql --since "1 hour ago"
sudo cat /etc/asdfunnel/env
```

---

## Stack Tecnologico

| Componente | Tecnologia |
|-----------|------------|
| **Frontend** | React 19, Vite 7, Tailwind CSS 4, shadcn/ui |
| **Backend** | Express 5, Node.js 20, TypeScript 5.9 |
| **Base de datos** | PostgreSQL + Drizzle ORM |
| **Autenticacion** | Contrasena con hash scrypt + cookies HttpOnly |
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
