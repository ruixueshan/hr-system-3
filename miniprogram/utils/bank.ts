function normalizeBankCard(cardNumber: string): string {
  return String(cardNumber || '').replace(/\s+/g, '');
}

function validateBankCard(cardNumber: string): boolean {
  const normalized = normalizeBankCard(cardNumber);
  if (!/^\d{13,19}$/.test(normalized)) return false;

  const digits = normalized.split('').map(Number);
  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits[i];
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

module.exports = {
  normalizeBankCard,
  validateBankCard
};

export {};
