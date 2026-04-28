FROM node:20-alpine AS build

WORKDIR /app

COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN npm --prefix backend ci
RUN npm --prefix frontend ci

COPY backend ./backend
COPY frontend ./frontend

RUN npm --prefix backend run build
RUN npm --prefix frontend run build

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY backend/package*.json ./backend/
RUN npm --prefix backend ci --omit=dev

COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend/dist ./frontend/dist

EXPOSE 3001

CMD ["node", "backend/dist/server.js"]
