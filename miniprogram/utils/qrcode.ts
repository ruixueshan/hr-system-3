function safeDecode(value: any): string {
  try {
    return decodeURIComponent(String(value || ''));
  } catch (err) {
    return String(value || '');
  }
}

function pickQueryValue(text: string): string {
  const query = text.includes('?') ? text.split('?').slice(1).join('?') : text;
  const pairs = query.split('&');
  for (const pair of pairs) {
    const [key, val = ''] = pair.split('=');
    if (['code', 'scene', 'ref_code'].includes(key)) {
      return safeDecode(val).trim();
    }
  }
  return '';
}

function extractQrCode(input: any): string {
  const raw = safeDecode(input).trim();
  if (!raw) return '';

  const queryValue = pickQueryValue(raw);
  if (queryValue) return extractQrCode(queryValue);

  return raw;
}

function extractQrCodeFromOptions(options: any = {}, keys: string[] = ['scene', 'code', 'ref_code']): string {
  for (const key of keys) {
    const code = extractQrCode(options?.[key]);
    if (code) return code;
  }
  return '';
}

module.exports = {
  extractQrCode,
  extractQrCodeFromOptions
};

export {};
