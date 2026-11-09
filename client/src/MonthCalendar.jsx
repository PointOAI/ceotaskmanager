import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTHS_LONG, WEEKDAYS, toISODate, todayISO, fmtTime } from './lib';

export function monthRange(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return { days, from: toISODate(days[0]), to: toISODate(days[41]) };
}

/** items: [{ key, date (iso or datetime), end?, title, color, done?, onClick }] */
export default function MonthCalendar({ month, setMonth, items, onDayClick, right }) {
  const { days } = monthRange(month);
  const today = todayISO();
  const byDay = {};
  for (const it of items) {
    const start = String(it.date).slice(0, 10);
    const end = it.end ? String(it.end).slice(0, 10) : start;
    for (const d of days) {
      const iso = toISODate(d);
      if (iso >= start && iso <= end) (byDay[iso] = byDay[iso] || []).push(it);
    }
  }
  Object.values(byDay).forEach((l) => l.sort((a, b) => String(a.date).localeCompare(String(b.date))));
  return (
    <>
      <div className="cal-head">
        <h2>{MONTHS_LONG[month.getMonth()]} {month.getFullYear()}</h2>
        <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
        <button className="btn sm" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
        <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
        <span style={{ flex: 1 }} />
        {right}
      </div>
      <div className="cal">
        {WEEKDAYS.map((w) => <div key={w} className="dow">{w}</div>)}
        {days.map((d) => {
          const iso = toISODate(d);
          const list = byDay[iso] || [];
          return (
            <div
              key={iso}
              className={`day${d.getMonth() !== month.getMonth() ? ' other' : ''}${iso === today ? ' today' : ''}`}
              onDoubleClick={() => onDayClick?.(iso)}
            >
              <div className="num"><span>{d.getDate()}</span></div>
              {list.slice(0, 4).map((it) => (
                <button key={it.key} className={`cal-item c-${it.color}${it.done ? ' done' : ''}`} onClick={it.onClick} title={it.title}>
                  {it.icon}
                  <span>{fmtTime(it.date) && String(it.date).slice(0, 10) === iso ? <b style={{ fontWeight: 600 }}>{fmtTime(it.date).replace(':00', '')} </b> : null}{it.title}</span>
                </button>
              ))}
              {list.length > 4 && <span className="faint small" style={{ paddingLeft: 5 }}>+{list.length - 4} more</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
