# syntax=docker/dockerfile:1
#
# Silikon3D (breadboarding) için çok aşamalı imaj.
#
#   docker build -t breadboarding-web .                  # üretim imajı: nginx, 8080 portu (varsayılan hedef)
#   docker build --target test -t breadboarding-test .   # tip denetimi + vitest (yalnız testler geçerse oluşur)
#   docker build --target dev  -t breadboarding-dev  .   # Vite ve Node araçları (docker compose'daki dev ve cli)
#
# Aşamalar: base → deps (npm ci) → dev | build (npm run build) → test | web (nginx + dist/)
# Ayrıntı: README.md, "Docker ile" bölümü.

ARG NODE_VERSION=22
ARG NGINX_VERSION=1.27

# ---------------------------------------------------------------------------------------------
# base: Node 22 (.nvmrc ile aynı); bütün Node aşamaları root yerine "node" (uid 1000) kullanıcısıyla
FROM node:${NODE_VERSION}-alpine AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false
WORKDIR /app
RUN chown node:node /app
USER node

# ---------------------------------------------------------------------------------------------
# deps: yalnız package.json ve package-lock.json kopyalanır; kaynak değişince bu katman önbellekte kalır.
# node_modules/.vite (Vite'ın önbelleği) herkese yazılabilir: dev kapsayıcısı başka bir uid ile de çalışır.
# TLS denetleyen bir kurum ağındaysan (npm ci "certificate" hatası verir) kök sertifikayı gizli olarak ver;
# imaja girmez:  docker build --secret id=npm_ca,src=/yol/kok-sertifika.pem .
FROM base AS deps
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    --mount=type=secret,id=npm_ca,uid=1000,required=false \
    if [ -s /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi \
 && npm ci \
 && mkdir -p node_modules/.vite \
 && chmod 1777 node_modules/.vite

# ---------------------------------------------------------------------------------------------
# dev: kaynak docker compose ile bağlanır (bind mount), node_modules isimli birimde kalır
FROM deps AS dev
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]

# ---------------------------------------------------------------------------------------------
# build: tsc -b && vite build → /app/dist; metin dosyalarının .gz kopyaları nginx'in gzip_static'i için
FROM deps AS build
COPY --chown=node:node . .
# Sitenin herkese açık adresi (örn. https://silikon3d.example): kanonik bağlantı, og:url ve sitemap.xml
# bununla yazılır. Boşsa paylaşım etiketleri göreli adreslerle yazılır (src/seo.ts).
ARG SITE_URL=""
ENV SITE_URL=$SITE_URL
RUN npm run build \
 && find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' -o -name '*.svg' \
      -o -name '*.webmanifest' -o -name '*.xml' \) \
      -size +1k -exec gzip -9 -k {} +

# ---------------------------------------------------------------------------------------------
# test: docker build --target test . (varsayılan hedefe girmez; ~1-2 dakika)
FROM build AS test
RUN npm test

# ---------------------------------------------------------------------------------------------
# web: üretim imajı. Root olmayan nginx (uid 101), 8080 portu, yalnız dist/ ve nginx ayarı.
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine AS web
LABEL org.opencontainers.image.title="Silikon3D" \
      org.opencontainers.image.description="Tarayıcıda transistör seviyesinde 3D CPU simülatörü, CPU16 ve 8 bit hesap makinesi" \
      org.opencontainers.image.source="https://github.com/MihrimatriX/breadboarding" \
      org.opencontainers.image.licenses="MIT"
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=0:0 /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
