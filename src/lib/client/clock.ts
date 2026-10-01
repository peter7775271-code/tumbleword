interface Sample {
  offset: number;
  rtt: number;
  at: number;
}

const MAX_SAMPLES = 8;

/**
 * Estimates the server clock offset from API round-trips (NTP-style): the server time is
 * assumed to correspond to the midpoint of the request. The lowest-latency recent sample wins.
 */
class ServerClock {
  private samples: Sample[] = [];
  private offset = 0;

  sample(serverNow: number, sentAt: number, receivedAt: number): void {
    const rtt = receivedAt - sentAt;
    this.samples.push({ offset: serverNow - (sentAt + rtt / 2), rtt, at: receivedAt });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    this.offset = this.samples.reduce((best, s) => (s.rtt < best.rtt ? s : best)).offset;
  }

  now(): number {
    return Date.now() + this.offset;
  }

  /** Converts a server timestamp to the equivalent local Date.now() value. */
  toLocal(serverTime: number): number {
    return serverTime - this.offset;
  }
}

export const serverClock = new ServerClock();
