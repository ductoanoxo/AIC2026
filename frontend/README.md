# Frontend

React + TypeScript + Vite frontend for the AIC 2026 Video Retrieval console.

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

Set `VITE_API_URL` to the backend API base URL. The default value is `/api`.

## Verification

```bash
npm test
npm run lint
npm run build
```

The API boundary is centralized in `src/services/api.ts`. UI components must not
call `fetch` directly.
