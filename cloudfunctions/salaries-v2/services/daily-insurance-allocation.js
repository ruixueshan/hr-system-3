function getLedgerId(ledger) {
  return String(ledger?._id || ledger?.id || '');
}

function pickUnconsumedLedgers(ledgers = [], consumedLedgerIds = new Set()) {
  return (Array.isArray(ledgers) ? ledgers : []).filter((ledger) => {
    const ledgerId = getLedgerId(ledger);
    return ledgerId && !consumedLedgerIds.has(ledgerId);
  });
}

function consumeLedgerIds(ledgers = [], consumedLedgerIds = new Set()) {
  for (const ledger of Array.isArray(ledgers) ? ledgers : []) {
    const ledgerId = getLedgerId(ledger);
    if (ledgerId) consumedLedgerIds.add(ledgerId);
  }
  return consumedLedgerIds;
}

module.exports = {
  consumeLedgerIds,
  pickUnconsumedLedgers
};
