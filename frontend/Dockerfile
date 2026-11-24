# Etap 1: build produkcyjny aplikacji React (Vite)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci wymaga lockfile'a zgodnego co do bajtu; lockfile generowany na macOS nie zawiera części
# opcjonalnych zależności dla Linuksa (np. @emnapi/* rolldowna), wtedy uzupełnia je npm install
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY . .
RUN npm run build

# Etap 2: serwowanie statycznych plików przez nginx, /api i /health przekierowane do backendu
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
