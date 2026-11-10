FROM node:24-bookworm-slim AS compilacao
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

FROM nginx:1.28-alpine AS runtime
COPY deploy/demonstracao/nginx.conf /etc/nginx/nginx.conf
COPY --from=compilacao /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
