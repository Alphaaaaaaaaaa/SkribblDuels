export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function numberField(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  return isNumber(value) ? value : null;
}

export function stringField(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return isString(value) ? value : null;
}

export function booleanField(record: UnknownRecord, key: string): boolean | null {
  const value = record[key];
  return isBoolean(value) ? value : null;
}

export function arrayField(record: UnknownRecord, key: string): unknown[] | null {
  const value = record[key];
  return Array.isArray(value) ? value : null;
}

export function numberArray(value: unknown): number[] | null {
  if (!Array.isArray(value) || !value.every(isNumber)) return null;
  return value;
}

export function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every(isString)) return null;
  return value;
}
