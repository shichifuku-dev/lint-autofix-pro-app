FROM node:20-bookworm-slim

# git が無いと PR処理で git init が失敗するため同梱
RUN apt-get update && apt-get install -y --no-install-recommends \
  git ca-certificates openssh-client \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 依存を先に入れてキャッシュを効かせる
COPY app-server/package*.json ./app-server/
RUN cd app-server && npm ci

# 残りをコピーしてビルド
COPY . .
RUN cd app-server && npm run prisma:generate && npm run build

ENV NODE_ENV=production
EXPOSE 10000

# Render で動くよう、直接 dist を起動（npm run start でも可）
CMD ["node", "app-server/dist/src/index.js"]
