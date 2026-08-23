import { performance } from "node:perf_hooks";

export interface ClockReading {
  utc_timestamp: string;
  monotonic_ms: number;
}

export interface PlatformClock {
  now(): ClockReading;
}

export class ClockError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST";
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ClockError";
    this.code = "PLATFORM_INVALID_REQUEST";
    this.details = details;
  }
}

const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

export function assertUtcTimestamp(value: unknown, field = "utc_timestamp"): string {
  if (typeof value !== "string" || !UTC_TIMESTAMP_PATTERN.test(value)) {
    throw new ClockError(`Invalid UTC timestamp: ${field}`, { field, value });
  }
  return value;
}

export function assertMonotonicClock(value: unknown, field = "monotonic_ms"): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new ClockError(`Invalid monotonic clock value: ${field}`, { field, value });
  }
  return Number(value);
}

export function assertClockReading(reading: ClockReading): ClockReading {
  assertUtcTimestamp(reading.utc_timestamp);
  assertMonotonicClock(reading.monotonic_ms);
  return reading;
}

export class SystemClock implements PlatformClock {
  #last_monotonic_ms = 0;

  now(): ClockReading {
    const monotonic_ms = Math.max(Math.floor(performance.now()), this.#last_monotonic_ms + 1);
    this.#last_monotonic_ms = monotonic_ms;
    return {
      utc_timestamp: new Date().toISOString(),
      monotonic_ms,
    };
  }
}

export class ManualClock implements PlatformClock {
  #utc_timestamp: string;
  #monotonic_ms: number;

  constructor(initial: ClockReading = { utc_timestamp: "2026-08-23T00:00:00.000Z", monotonic_ms: 0 }) {
    assertClockReading(initial);
    this.#utc_timestamp = initial.utc_timestamp;
    this.#monotonic_ms = initial.monotonic_ms;
  }

  now(): ClockReading {
    return {
      utc_timestamp: this.#utc_timestamp,
      monotonic_ms: this.#monotonic_ms,
    };
  }

  advance(milliseconds: number): ClockReading {
    if (!Number.isInteger(milliseconds) || milliseconds < 0) {
      throw new ClockError("ManualClock advance requires a non-negative integer", { milliseconds });
    }
    this.#monotonic_ms += milliseconds;
    this.#utc_timestamp = new Date(Date.parse(this.#utc_timestamp) + milliseconds).toISOString();
    return this.now();
  }

  set(reading: ClockReading): ClockReading {
    assertClockReading(reading);
    if (reading.monotonic_ms < this.#monotonic_ms) {
      throw new ClockError("ManualClock monotonic_ms cannot move backwards", {
        current_monotonic_ms: this.#monotonic_ms,
        next_monotonic_ms: reading.monotonic_ms,
      });
    }
    this.#utc_timestamp = reading.utc_timestamp;
    this.#monotonic_ms = reading.monotonic_ms;
    return this.now();
  }
}
