export type ReversalState = { kind?: string; status: string };
export const bankCancellationConfirmed = (rows?: ReversalState[]) => Boolean(rows?.some(row => row.kind === 'CANCEL' && row.status === 'SUCCEEDED'));
export function reversalStateLabel(row: ReversalState) {
 const labels: Record<string, string> = row.kind === 'CANCEL'
  ? { PENDING: 'Ödeme iptali bekleniyor', REVIEW: 'İptal sonucu kontrol ediliyor', SUCCEEDED: 'Ödeme iptal edildi', FAILED: 'Ödeme iptali başarısız' }
  : { PENDING: 'İade bekleniyor', REVIEW: 'İade sonucu kontrol ediliyor', SUCCEEDED: 'İade edildi', FAILED: 'İade başarısız' };
 return labels[row.status] ?? 'İşleniyor';
}
