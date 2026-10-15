// Calendar months are counted in UTC, then the remainder is split into weeks/days.
export function elapsedDuration(from: string, now: number) {
  const start = new Date(from);
  if (!Number.isFinite(start.getTime())) return '—';
  if (now - start.getTime() < 60_000) return 'Az önce';
  const end = new Date(now);
  let months = (end.getUTCFullYear()-start.getUTCFullYear())*12+end.getUTCMonth()-start.getUTCMonth();
  const addMonths = (count: number) => {
    const date = new Date(start);
    date.setUTCDate(1); date.setUTCMonth(start.getUTCMonth()+count);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    date.setUTCDate(Math.min(start.getUTCDate(),lastDay));
    return date.getTime();
  };
  if (addMonths(months)>now) months--;
  months = Math.max(0,months);
  let minutes = Math.floor((now-addMonths(months))/60_000);
  const weeks = Math.floor(minutes/(7*24*60)); minutes %= 7*24*60;
  const days = Math.floor(minutes/(24*60)); minutes %= 24*60;
  const hours = Math.floor(minutes/60); minutes %= 60;
  const parts: string[]=[];
  if(months>=12) parts.push(`${Math.floor(months/12)} yıl`);
  if(months%12) parts.push(`${months%12} ay`);
  if(weeks) parts.push(`${weeks} hafta`);
  if(days) parts.push(`${days} gün`);
  if(hours) parts.push(`${hours} saat`);
  if(minutes) parts.push(`${minutes} dakika`);
  return `${parts.join(' ')} geçti`;
}
