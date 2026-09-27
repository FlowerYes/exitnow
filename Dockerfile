FROM node:22-bookworm-slim AS base
WORKDIR /app
COPY package*.json ./
COPY packages ./packages
COPY apps ./apps
COPY db ./db
COPY tsconfig.json ./
RUN npm ci --no-audit --no-fund
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000 8787
CMD ["npm", "run", "start"]
