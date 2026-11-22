// Server lokal untuk development (`npm run dev`). Di Vercel yang dipakai api/index.ts.
import 'dotenv/config';
import { Config } from './config/Config';
import { createApp } from './container';

const config = Config.fromEnv();
createApp(config).listen(config.port, () => {
  console.log(`aibot-js listening on http://localhost:${config.port}`);
});
