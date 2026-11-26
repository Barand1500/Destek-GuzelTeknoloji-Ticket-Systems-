import ExcelJS from 'exceljs';

type Person = { id: string; name: string };
type Usage = Person & { ticketCount: number; net: number };
type Movement = { createdAt: string | Date; credits: number; kind?: string; agreement: Person | null; conversation: { number: number; subject: string; customer: Person } };
type Report = { data: (Usage | Movement)[]; people: Person[]; agreements: Person[] };
type Filters = { view?: 'people' | 'movements'; startsOn?: string; endsOn?: string; personId?: string; agreementId?: string };

// Excel dates have no timezone. Store the Istanbul wall clock as an Excel date.
function istanbulDate(value: string | Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second')));
}

export async function exportCreditHistory(report: Report, filters: Filters, companyName: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Destek';
  workbook.created = new Date();
  const people = filters.view === 'people';
  const sheet = workbook.addWorksheet(people ? 'Kişilere göre kullanım' : 'Kredi hareketleri', { views: [{ state: 'frozen', ySplit: 6 }] });
  const headings = people ? ['Kişi', 'Talep sayısı', 'Kullanılan kredi'] : ['Tarih / Saat (İstanbul)', 'Kişi', 'Talep no', 'Talep konusu', 'Anlaşma / Paket', 'İşlem', 'Kredi'];
  const count = headings.length;
  sheet.columns = (people ? [38, 20, 24] : [25, 30, 18, 55, 32, 22, 16]).map(width => ({ width }));
  sheet.mergeCells(1, 1, 1, count);
  sheet.getCell(1, 1).value = companyName;
  sheet.getRow(1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF173647' } };
  sheet.getRow(1).height = 30;
  const displayDate = (value?: string) => value ? value.split('-').reverse().join('.') : '';
  const range = filters.startsOn || filters.endsOn ? `${displayDate(filters.startsOn) || 'Başlangıçtan'} – ${displayDate(filters.endsOn) || 'Bugüne kadar'}` : 'Tüm tarihler';
  for (const [index, text] of [people ? 'Kişilere göre kullanım' : 'Son hareketler', `Tarih: ${range}`, `Kişi: ${report.people.find(row => row.id === filters.personId)?.name ?? 'Tüm kişiler'} · Anlaşma / Paket: ${report.agreements.find(row => row.id === filters.agreementId)?.name ?? 'Tüm anlaşmalar'}`].entries()) {
    sheet.mergeCells(index + 2, 1, index + 2, count); sheet.getCell(index + 2, 1).value = text;
  }
  sheet.getRow(4).alignment = { wrapText: true, vertical: 'middle' }; sheet.getRow(4).height = 32;
  sheet.getRow(6).values = headings;
  sheet.getRow(6).height = 26;
  sheet.getRow(6).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173647' } };
  let credits = 0, tickets = 0;
  for (const entry of report.data) {
    const amount = 'ticketCount' in entry ? entry.net : entry.kind === 'RETURNED' ? entry.credits : -entry.credits;
    credits += amount;
    const row = 'ticketCount' in entry ? sheet.addRow([entry.name, entry.ticketCount, amount]) : sheet.addRow([istanbulDate(entry.createdAt), entry.conversation.customer.name, `#TK-${String(entry.conversation.number).padStart(5, '0')}`, entry.conversation.subject, entry.agreement?.name ?? 'Ücretsiz destek', entry.kind === 'RETURNED' ? 'Bakiyeye eklendi' : 'Kullanıldı', amount]);
    if ('ticketCount' in entry) tickets += entry.ticketCount;
    row.font = { name: 'Calibri', size: 11 };
    row.alignment = { vertical: 'top', wrapText: true };
    const lines = headings.map((_, index) => {
      const value = row.getCell(index + 1).value;
      return typeof value === 'string' ? value.split('\n').reduce((total, line) => total + Math.max(1, Math.ceil(line.length / Math.max(8, (sheet.getColumn(index + 1).width ?? 20) - 3))), 0) : 1;
    });
    row.height = Math.min(409, Math.max(24, Math.max(...lines) * 16));
    if (!people) row.getCell(1).numFmt = 'dd.mm.yyyy hh:mm:ss';
    row.getCell(count).numFmt = '#,##0;[Red]-#,##0;0';
    if (people) row.getCell(2).numFmt = '#,##0';
    if (row.number % 2) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F8' } };
  }
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: Math.max(6, sheet.rowCount), column: count } };
  const footer = sheet.addRow(people ? ['Toplam', tickets, credits] : ['Toplam kredi değişimi', '', '', '', '', '', credits]);
  footer.font = { name: 'Calibri', bold: true, size: 11 }; footer.height = 26; footer.getCell(count).numFmt = '#,##0;[Red]-#,##0;0';
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return workbook.xlsx.writeBuffer();
}
