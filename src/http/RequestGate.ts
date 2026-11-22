/** Izin memproses satu request. Wajib di-release setelah request selesai. */
export interface Lease {
  /** Ter-abort saat batas waktu habis atau client memutus koneksi */
  readonly signal: AbortSignal;
  release(): void;
}

/**
 * Mutex untuk request AI: hanya satu request yang boleh berjalan dalam satu waktu.
 * Request lain langsung ditolak (bukan diantrekan) agar kuota API tidak terbakar.
 *
 * Lock dilepas saat request selesai, atau paling lambat `holdMs`. Saat waktu habis,
 * signal di-abort sehingga panggilan AI yang masih berjalan ikut dibatalkan.
 *
 * Aman dari race condition karena Node menjalankan JavaScript di satu thread dan
 * `tryAcquire` memeriksa sekaligus mengambil lock tanpa `await` di antaranya.
 */
export class RequestGate {
  private current: { id: number; controller: AbortController; timer: NodeJS.Timeout; expiresAt: number } | null = null;
  private nextId = 1;

  constructor(readonly holdMs: number) {}

  /** Mengembalikan null jika masih ada request lain yang sedang diproses. */
  tryAcquire(): Lease | null {
    if (this.current) return null;

    const id = this.nextId++;
    const controller = new AbortController();
    const timer = setTimeout(() => this.release(id), this.holdMs);
    timer.unref();
    this.current = { id, controller, timer, expiresAt: Date.now() + this.holdMs };

    return { signal: controller.signal, release: () => this.release(id) };
  }

  get busy(): boolean {
    return this.current !== null;
  }

  /** Perkiraan detik sampai lock pasti lepas, untuk header Retry-After. */
  retryAfterSeconds(): number {
    if (!this.current) return 0;
    return Math.max(1, Math.ceil((this.current.expiresAt - Date.now()) / 1000));
  }

  private release(id: number): void {
    // Abaikan release dari lease lama yang lock-nya sudah diambil alih request lain
    if (!this.current || this.current.id !== id) return;
    clearTimeout(this.current.timer);
    // Batalkan panggilan AI yang mungkin masih berjalan (tidak berpengaruh jika sudah selesai)
    this.current.controller.abort();
    this.current = null;
  }
}
