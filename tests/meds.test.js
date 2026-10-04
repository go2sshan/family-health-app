const m = require('./build/meds.js');
let fails = 0; const ok = (c, w) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + w); if (!c) fails++; };
const sched = (o) => ({ id: 's1', member_id: 'a', record_id: null, name: 'Metformin', strength: '500 mg', form: 'tablet', dose_qty: 1, dose_unit: 'tablet', pill_color: 'white', instructions: null, frequency: 'daily', days_of_week: null, times: ['20:00', '08:00'], start_date: '2026-10-01', end_date: null, active: true, ...o });
const me = { id: 'a', first_name: 'Shan', color: 'teal' }, dau = { id: 'd', first_name: 'Anu', color: 'rose' };
const sun = new Date(2026, 9, 4), mon = new Date(2026, 9, 5);
ok(m.runsOn(sched({}), sun), 'daily medicine runs today');
ok(!m.runsOn(sched({ start_date: '2026-10-10' }), sun), 'not before its start date');
ok(!m.runsOn(sched({ end_date: '2026-10-03' }), sun), 'not after a short course ends');
ok(m.runsOn(sched({ frequency: 'days', days_of_week: [1] }), sun) && !m.runsOn(sched({ frequency: 'days', days_of_week: [1] }), mon), 'Sunday-only medicine runs on Sunday, not Monday');
ok(!m.runsOn(sched({ frequency: 'as_needed', times: [] }), sun), 'as-needed has no scheduled slots');
ok(!m.runsOn(sched({ active: false }), sun), 'paused medicine has no slots');
const slots = m.buildDay(sun, [sched({}), sched({ id: 's2', member_id: 'd', name: 'Cetirizine', times: ['08:00'] })], [me, dau], [
  { id: 'x', member_id: 'a', schedule_id: 's1', scheduled_for: new Date(2026, 9, 4, 8, 0).toISOString(), status: 'taken', logged_at: new Date().toISOString(), owner: 'a' },
]);
ok(slots.length === 3, 'two people, three doses today');
ok(slots.map((s) => s.time).join() === '08:00,08:00,20:00', 'sorted by time');
ok(slots.find((s) => s.member.id === 'a' && s.time === '08:00').dose?.status === 'taken' && slots.find((s) => s.member.id === 'd').dose === null, 'my 8 AM dose shows Taken, daughter\'s is still open');
ok(m.doseText({ dose_qty: 0.5, dose_unit: 'tablet' }) === '½ tablet' && m.doseText({ dose_qty: 2, dose_unit: 'tablet' }) === '2 tablets' && m.doseText({ dose_qty: 5, dose_unit: 'ml' }) === '5 ml', 'dose wording: ½ tablet, 2 tablets, 5 ml');
ok(m.time12('08:00') === '8:00 AM' && m.time12('20:30') === '8:30 PM' && m.time12('00:15') === '12:15 AM' && m.time12('12:00') === '12:00 PM', '12-hour times');
ok(m.isTime('07:30') && !m.isTime('7:3') && !m.isTime('24:00'), 'time validation');
ok(m.panelColors('rose', false)[0] !== m.panelColors('teal', false)[0], 'different people get different panel colors');
process.exit(fails ? 1 : 0);
