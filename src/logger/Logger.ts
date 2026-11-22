import type { LogLevel } from '../config/Config';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

type Fields = Record<string, unknown>;

/** Logger JSON satu baris per entri, mudah dibaca di Vercel Logs. */
export class Logger {
  constructor(private readonly minLevel: LogLevel = 'info') {}

  debug(msg: string, fields?: Fields): void { this.write('debug', msg, fields); }
  info(msg: string, fields?: Fields): void { this.write('info', msg, fields); }
  warn(msg: string, fields?: Fields): void { this.write('warn', msg, fields); }
  error(msg: string, fields?: Fields): void { this.write('error', msg, fields); }

  private write(level: LogLevel, msg: string, fields: Fields = {}): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const entry = { time: new Date().toISOString(), level, msg, ...Logger.serialize(fields) };
    const line = JSON.stringify(entry);
    if (level === 'error' || level === 'warn') console.error(line);
    else console.log(line);
  }

  private static serialize(fields: Fields): Fields {
    const out: Fields = {};
    for (const [key, value] of Object.entries(fields)) {
      out[key] = value instanceof Error ? value.message : value;
    }
    return out;
  }
}

/** Logger yang tidak mencetak apa pun — dipakai di test. */
export class SilentLogger extends Logger {
  override debug(): void {}
  override info(): void {}
  override warn(): void {}
  override error(): void {}
}
