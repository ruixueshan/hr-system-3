const assert = require('node:assert/strict');
const test = require('node:test');

const {
  consumeLedgerIds,
  pickUnconsumedLedgers
} = require('./daily-insurance-allocation');

test('pickUnconsumedLedgers skips ledgers already assigned in the same batch', () => {
  const consumed = new Set();
  const aprilLedger = { _id: 'ledger-2026-04', remaining_amount: 85 };

  assert.deepEqual(pickUnconsumedLedgers([], consumed), []);

  const firstAssignable = pickUnconsumedLedgers([aprilLedger], consumed);
  assert.deepEqual(firstAssignable, [aprilLedger]);

  consumeLedgerIds(firstAssignable, consumed);

  assert.deepEqual(pickUnconsumedLedgers([aprilLedger], consumed), []);
});

test('pickUnconsumedLedgers can allocate newer due ledgers after older ones are consumed', () => {
  const consumed = new Set(['ledger-2026-04']);
  const mayLedger = { _id: 'ledger-2026-05', remaining_amount: 85 };

  const assignable = pickUnconsumedLedgers([
    { _id: 'ledger-2026-04', remaining_amount: 0 },
    mayLedger
  ], consumed);

  assert.deepEqual(assignable, [mayLedger]);
});
