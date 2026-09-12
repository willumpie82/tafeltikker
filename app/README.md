# Tafeltikker app

Backend + frontend for Tafeltikker, built with Fastify + TypeScript.

## Development

```sh
npm install
npm run dev
```

Server listens on `http://localhost:3000` by default (see `.env.example`).
`GET /healthz` returns `{ "status": "ok" }` once it's up.

## Build

```sh
npm run build
npm start
```
