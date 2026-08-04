import type { DecodedSocketRecord } from '../protocol/types';
import type { RawSocketRecord } from '../recorder/rawRecord';

export interface PacketExportOptions {
  includeDrawPackets?: boolean;
}

export interface ExportFilterSummary {
  inputCount: number;
  outputCount: number;
  omittedDrawPackets: number;
  includeDrawPackets: boolean;
}

export function filterRawRecords(
  records: readonly RawSocketRecord[],
  options: PacketExportOptions = {}
): { records: RawSocketRecord[]; summary: ExportFilterSummary } {
  const includeDrawPackets = options.includeDrawPackets === true;
  const filtered = includeDrawPackets
    ? records.slice()
    : records.filter(record => record.packetId !== 19);

  return {
    records: filtered,
    summary: {
      inputCount: records.length,
      outputCount: filtered.length,
      omittedDrawPackets: includeDrawPackets ? 0 : records.length - filtered.length,
      includeDrawPackets
    }
  };
}

export function filterDecodedRecords(
  records: readonly DecodedSocketRecord[],
  options: PacketExportOptions = {}
): { records: DecodedSocketRecord[]; summary: ExportFilterSummary } {
  const includeDrawPackets = options.includeDrawPackets === true;
  const filtered = includeDrawPackets
    ? records.slice()
    : records.filter(record => record.decoded.packetId !== 19);

  return {
    records: filtered,
    summary: {
      inputCount: records.length,
      outputCount: filtered.length,
      omittedDrawPackets: includeDrawPackets ? 0 : records.length - filtered.length,
      includeDrawPackets
    }
  };
}
