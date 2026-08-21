# ============================================================================
#  AlphaSync Real — Frontend image (Vite build → nginx)
#  Build context: ./frontend   Built ON the server via compose up -d --build.
#  Internal nginx proxies /api,/ws,/uploads to the "backend" service.
# ============================================================================

# ── Stage 1: build the React app ──
FROM node:18-alpine AS build

WORKDIR /app
ENV PATH="/app/node_modules/.bin:$PATH"

# Firebase public client config, baked into the bundle at build time.
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .
RUN vite build

# ── Stage 2: serve with nginx ──
FROM nginx:alpine
# App-internal nginx (proxies to the backend service). Distinct from the HOST
# nginx site under ./nginx/ that terminates TLS for demo.alphasync.app.
COPY nginx.internal.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
