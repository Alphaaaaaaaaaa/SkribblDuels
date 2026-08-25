import type { GatewayClientMessage, GatewayServerMessage } from '@skribbl-duels/gateway-contracts';

type Labels = Readonly<Record<string, string>>;

interface HistogramState {
  buckets: number[];
  counts: number[];
  count: number;
  sum: number;
}

function metricKey(name: string, labels: Labels): string {
  const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
  return `${name}|${entries.map(([key, value]) => `${key}=${value}`).join(',')}`;
}

function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('"', '\\"');
}

function labelText(labels: Labels): string {
  const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
  return entries.length === 0
    ? ''
    : `{${entries.map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(',')}}`;
}

function splitMetricKey(key: string): { name: string; labels: Labels } {
  const separator = key.indexOf('|');
  const name = key.slice(0, separator);
  const labels = Object.fromEntries(key.slice(separator + 1).split(',').filter(Boolean).map(entry => {
    const equals = entry.indexOf('=');
    return [entry.slice(0, equals), entry.slice(equals + 1)];
  }));
  return { name, labels };
}

export class GatewayMetrics {
  private readonly startedAt = Date.now();
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly histograms = new Map<string, HistogramState>();
  private readonly seenMatchEvents = new Set<string>();
  private readonly seenClaimResolutions = new Set<string>();

  public increment(name: string, labels: Labels = {}, amount = 1): void {
    const key = metricKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + amount);
  }

  public gauge(name: string, value: number, labels: Labels = {}): void {
    this.gauges.set(metricKey(name, labels), value);
  }

  public observe(name: string, value: number, buckets: readonly number[], labels: Labels = {}): void {
    if (!Number.isFinite(value)) return;
    const key = metricKey(name, labels);
    const state = this.histograms.get(key) ?? {
      buckets: [...buckets].sort((left, right) => left - right),
      counts: buckets.map(() => 0),
      count: 0,
      sum: 0
    };
    state.count += 1;
    state.sum += value;
    state.buckets.forEach((bucket, index) => {
      if (value <= bucket) state.counts[index] = (state.counts[index] ?? 0) + 1;
    });
    this.histograms.set(key, state);
  }

  public observeInbound(message: GatewayClientMessage, receivedAt: number): void {
    this.increment('skribbl_duels_gateway_commands_total', { type: message.type });
    if (message.type === 'TELEMETRY_BATCH') {
      const latest = message.envelopes.at(-1);
      if (latest) {
        this.observe(
          'skribbl_duels_gateway_telemetry_lag_seconds',
          Math.max(0, receivedAt - latest.event.occurredAt) / 1_000,
          [0.1, 0.25, 0.5, 1, 2, 5, 15, 60]
        );
      }
    }
  }

  public observeOutbound(message: GatewayServerMessage): void {
    if (message.type === 'CLAIM_RESOLUTION') {
      const resolutionKey = `${message.matchId}:${message.ownerAccountId}:${message.candidateId}:${message.revision}`;
      if (!this.seenClaimResolutions.has(resolutionKey)) {
        this.seenClaimResolutions.add(resolutionKey);
        const reason = message.reason ?? 'none';
        this.increment('skribbl_duels_gateway_claim_resolutions_total', {
          challenge: message.challengeId,
          outcome: message.accepted ? 'accepted' : 'rejected',
          reason,
          source: reason === 'server-telemetry-certified' ? 'server-telemetry' : 'client-candidate'
        });
        if (!message.accepted) {
          this.increment('skribbl_duels_gateway_rejected_claims_total', { reason });
        }
        while (this.seenClaimResolutions.size > 20_000) {
          const oldest = this.seenClaimResolutions.values().next().value as string | undefined;
          if (!oldest) break;
          this.seenClaimResolutions.delete(oldest);
        }
      }
    }
    if (message.type === 'MATCH_EVENT' && message.event.type === 'MATCH_ABORTED') {
      const eventKey = `${message.matchId}:${message.revision}:${message.event.type}`;
      if (!this.seenMatchEvents.has(eventKey)) {
        this.seenMatchEvents.add(eventKey);
        this.increment('skribbl_duels_gateway_match_aborts_total', {
          reason: message.event.reason ?? 'unknown'
        });
        while (this.seenMatchEvents.size > 10_000) {
          const oldest = this.seenMatchEvents.values().next().value as string | undefined;
          if (!oldest) break;
          this.seenMatchEvents.delete(oldest);
        }
      }
    }
  }

  public snapshot(): Record<string, unknown> {
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1_000),
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries([...this.histograms].map(([key, value]) => [key, {
        count: value.count,
        sum: value.sum,
        buckets: Object.fromEntries(value.buckets.map((bucket, index) => [bucket, value.counts[index]]))
      }]))
    };
  }

  public prometheus(): string {
    const lines: string[] = [
      '# HELP skribbl_duels_gateway_uptime_seconds Gateway process uptime.',
      '# TYPE skribbl_duels_gateway_uptime_seconds gauge',
      `skribbl_duels_gateway_uptime_seconds ${Math.floor((Date.now() - this.startedAt) / 1_000)}`
    ];
    for (const [key, value] of this.counters) {
      const metric = splitMetricKey(key);
      lines.push(`${metric.name}${labelText(metric.labels)} ${value}`);
    }
    for (const [key, value] of this.gauges) {
      const metric = splitMetricKey(key);
      lines.push(`${metric.name}${labelText(metric.labels)} ${value}`);
    }
    for (const [key, value] of this.histograms) {
      const metric = splitMetricKey(key);
      value.buckets.forEach((bucket, index) => {
        lines.push(`${metric.name}_bucket${labelText({ ...metric.labels, le: String(bucket) })} ${value.counts[index]}`);
      });
      lines.push(`${metric.name}_bucket${labelText({ ...metric.labels, le: '+Inf' })} ${value.count}`);
      lines.push(`${metric.name}_sum${labelText(metric.labels)} ${value.sum}`);
      lines.push(`${metric.name}_count${labelText(metric.labels)} ${value.count}`);
    }
    return `${lines.join('\n')}\n`;
  }
}
