const FORCE_DISABLE_SALARY_INSURANCE_V2 = true;

function parseBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  }
  return fallback;
}

async function getSystemConfigValue(db, key) {
  const res = await db.collection('system_config')
    .where({ key, status: 'active' })
    .limit(1)
    .get();
  return res.data?.[0]?.value;
}

async function getSalaryInsuranceV2RuntimeConfig(db) {
  const [enabledValue, shadowValue, companyIdsValue] = await Promise.all([
    getSystemConfigValue(db, 'salary_insurance_v2_enabled').catch(() => undefined),
    getSystemConfigValue(db, 'salary_insurance_v2_shadow_mode').catch(() => undefined),
    getSystemConfigValue(db, 'salary_insurance_v2_company_ids').catch(() => undefined)
  ]);

  const companyIds = Array.isArray(companyIdsValue)
    ? companyIdsValue.map((item) => String(item || '').trim()).filter(Boolean)
    : String(companyIdsValue || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  return {
    hardDisabled: FORCE_DISABLE_SALARY_INSURANCE_V2,
    enabled: parseBool(enabledValue, false),
    shadowMode: parseBool(shadowValue, false),
    companyIds
  };
}

function isSalaryInsuranceV2ActiveForCompany(config, companyId) {
  if (config?.hardDisabled) return false;
  if (!config?.enabled) return false;
  if (!config.companyIds?.length) return true;
  return config.companyIds.includes(String(companyId || ''));
}

function isSalaryInsuranceV2ShadowEnabled(config, companyId) {
  if (config?.hardDisabled) return false;
  if (!config?.shadowMode) return false;
  if (!config.companyIds?.length) return true;
  return config.companyIds.includes(String(companyId || ''));
}

module.exports = {
  getSalaryInsuranceV2RuntimeConfig,
  isSalaryInsuranceV2ActiveForCompany,
  isSalaryInsuranceV2ShadowEnabled
};