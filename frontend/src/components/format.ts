export const BADGE: Record<string, string> = { CT: 'CT', MR: 'MR', PT: 'PET', RTSTRUCT: 'RS', RTPLAN: 'RP', RTDOSE: 'RD', REG: 'REG', SEG: 'SEG' }

export function fmtBytes(n: number): string {
  if (!n) return '0 MB'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB'
  return (n / 1e6).toFixed(1) + ' MB'
}

export function fmtTime(ts: string | null | undefined): string {
  if (!ts) return '-'
  return ts.slice(0, 16).replace('T', ' ')
}
