import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestGate } from '../src/http/RequestGate';

afterEach(() => {
  vi.useRealTimers();
});

describe('RequestGate', () => {
  it('hanya mengizinkan satu lease dalam satu waktu', () => {
    const gate = new RequestGate(30_000);
    const first = gate.tryAcquire();

    expect(first).not.toBeNull();
    expect(gate.tryAcquire()).toBeNull();
    expect(gate.busy).toBe(true);
  });

  it('bisa dipakai lagi setelah lease dilepas', () => {
    const gate = new RequestGate(30_000);
    gate.tryAcquire()!.release();

    expect(gate.busy).toBe(false);
    expect(gate.tryAcquire()).not.toBeNull();
  });

  it('melepas lock dan membatalkan signal saat batas waktu habis', () => {
    vi.useFakeTimers();
    const gate = new RequestGate(30_000);
    const lease = gate.tryAcquire()!;

    vi.advanceTimersByTime(29_999);
    expect(gate.busy).toBe(true);
    expect(lease.signal.aborted).toBe(false);

    vi.advanceTimersByTime(1);
    expect(gate.busy).toBe(false);
    expect(lease.signal.aborted).toBe(true);
  });

  it('release dari lease lama tidak melepas lock milik request baru', () => {
    vi.useFakeTimers();
    const gate = new RequestGate(30_000);
    const old = gate.tryAcquire()!;
    vi.advanceTimersByTime(30_000); // lease lama kedaluwarsa

    const current = gate.tryAcquire()!;
    old.release(); // misalnya request lama baru selesai sekarang

    expect(gate.busy).toBe(true);
    expect(current.signal.aborted).toBe(false);
  });

  it('memberi perkiraan Retry-After dalam detik', () => {
    vi.useFakeTimers();
    const gate = new RequestGate(30_000);
    gate.tryAcquire();
    vi.advanceTimersByTime(10_000);

    expect(gate.retryAfterSeconds()).toBe(20);
  });
});
