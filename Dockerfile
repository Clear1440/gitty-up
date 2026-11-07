# Builds the client, then runs the server, which hosts it, with git installed.
# See the Docker section of the README for mounting your repositories.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache git openssh-client \
  # Mounted repositories belong to a host user, which git would otherwise refuse to work in.
  && git config --system --add safe.directory '*' \
  # Lets HTTPS pushes and pulls to GitHub use GH_TOKEN, when it is set.
  && git config --system credential.https://github.com.helper \
    '!f() { test "$1" = get && test -n "$GH_TOKEN" && printf "username=x-access-token\npassword=%s\n" "$GH_TOKEN"; }; f' \
  && mkdir /data && chown node:node /data

WORKDIR /app
ENV NODE_ENV=production \
  GITTY_UP_HOST=0.0.0.0 \
  GITTY_UP_PORT=4317 \
  GITTY_UP_DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist

USER node
VOLUME /data
EXPOSE 4317
CMD ["node", "server/index.js"]
