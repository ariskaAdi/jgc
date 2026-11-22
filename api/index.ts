// Entry point Vercel Function. vercel.json mengarahkan semua path ke sini.
import { Config } from '../src/config/Config';
import { createApp } from '../src/container';

export default createApp(Config.fromEnv());
