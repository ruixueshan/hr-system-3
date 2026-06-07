#!/usr/bin/env node
/**
 * Query salaries by employee_no and optional pay_date/year_month.
 * Usage:
 *  node scripts/query-salary-by-employee.js --employee_no E1773978839758 --pay_date 2026-05-30
 *  node scripts/query-salary-by-employee.js --employee_no E1773978839758 --year_month 2026-05
 *
 * Requires: @cloudbase/node-sdk installed and CloudBase env accessible (envId via CLOUDBASE_ENV_ID or configured in your environment).
 */

const cloudbase = require('@cloudbase/node-sdk');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = args[i+1] && !args[i+1].startsWith('--') ? args[i+1] : true;
      out[key] = val;
      if (val !== true) i++;
    }
  }
  return out;
}

async function main() {
  const opts = parseArgs();
  const employee_no = opts.employee_no;
  const pay_date = opts.pay_date;
  const year_month = opts.year_month;

  if (!employee_no) {
    console.error('Missing --employee_no');
    process.exit(1);
  }

  const envId = process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV_ID || undefined;
  if (!envId) {
    console.warn('No CLOUDBASE_ENV_ID set; attempting default init (may fail).');
  }

  const app = cloudbase.init({ env: envId });
  const db = app.database();

  const cond = { employee_no };
  if (pay_date) cond.pay_date = pay_date;
  if (year_month) cond.year_month = year_month;

  console.log('Query conditions:', cond);

  try {
    const res = await db.collection('salaries').where(cond).get();
    console.log(`Found ${ (res.data || []).length } records:`);
    (res.data || []).forEach(r => {
      console.log('---');
      console.log('_id:', r._id);
      console.log('employee_id:', r.employee_id);
      console.log('employee_no:', r.employee_no);
      console.log('pay_date:', r.pay_date);
      console.log('year_month:', r.year_month);
      console.log('status:', r.status);
      console.log('pay_method:', r.pay_method);
      console.log('paid_at:', r.paid_at);
      console.log('total_amount:', r.total_amount || r.net_pay || r.gross_pay);
      console.log('remark:', r.remark || r.adjust_remark || '');
    });
  } catch (err) {
    console.error('Query failed:', err && err.message);
    process.exit(2);
  }
}

main();
