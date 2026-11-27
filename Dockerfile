FROM node:20-alpine AS build
WORKDIR /app
ARG RUST_BACKEND_URL=http://backend:8080
ENV RUST_BACKEND_URL=$RUST_BACKEND_URL
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DATABASE_URL=$DATABASE_URL
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3219
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3219
CMD ["node", "server.js"]
