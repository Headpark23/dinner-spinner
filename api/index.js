// Vercel runs this as the server for everything under /api.
// The server itself is bundled from server.ts during `npm run build`.
import { app } from '../dist-server/server.js';

export default app;
