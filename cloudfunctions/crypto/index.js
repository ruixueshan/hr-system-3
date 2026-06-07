/**
 * 加密解密云函数
 * 提供AES-256-GCM加密解密、数据脱敏等功能
 */

const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
let ENCRYPTION_KEY = null;

// 从环境变量或 system_config 获取密钥
function getEncryptionKey() {
  if (ENCRYPTION_KEY) return ENCRYPTION_KEY;

  const keyBase64 = process.env.ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error('未配置 ENCRYPTION_KEY 环境变量');
  }
  ENCRYPTION_KEY = Buffer.from(keyBase64, 'base64');
  return ENCRYPTION_KEY;
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

function decrypt(encryptedData) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(encryptedData.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

  let decrypted = decipher.update(encryptedData.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// 脱敏函数
function maskPhone(phone) {
  if (!phone || phone.length < 7) return '****';
  return phone.substring(0, 3) + '****' + phone.substring(phone.length - 4);
}

function maskIdCard(idCard) {
  if (!idCard || idCard.length < 8) return '****';
  return idCard.substring(0, 6) + '****' + idCard.substring(idCard.length - 4);
}

function maskBankCard(bankCard) {
  if (!bankCard || bankCard.length < 8) return '****';
  // 银行卡通常前6位是银行标识，后4位是卡号尾号
  return bankCard.substring(0, 6) + '****' + bankCard.substring(bankCard.length - 4);
}

/**
 * 主入口
 */
exports.main = async (event, context) => {
  const { action, params = {} } = event;
  
  try {
    switch (action) {
      case 'encrypt':
        // 加密文本
        const { text } = params;
        if (!text) {
          return {
            code: 400,
            message: '缺少参数: text',
            data: null
          };
        }
        const encryptedData = encrypt(text);
        return {
          code: 0,
          message: 'success',
          data: encryptedData
        };
        
      case 'decrypt':
        // 解密数据
        const { ciphertext, iv, authTag } = params;
        if (!ciphertext || !iv || !authTag) {
          return {
            code: 400,
            message: '缺少参数: ciphertext, iv, authTag',
            data: null
          };
        }
        const decryptedText = decrypt({ ciphertext, iv, authTag });
        return {
          code: 0,
          message: 'success',
          data: decryptedText
        };
        
      case 'maskPhone':
        // 手机号脱敏
        const { phone } = params;
        const maskedPhone = maskPhone(phone);
        return {
          code: 0,
          message: 'success',
          data: maskedPhone
        };
        
      case 'maskIdCard':
        // 身份证脱敏
        const { idCard } = params;
        const maskedIdCard = maskIdCard(idCard);
        return {
          code: 0,
          message: 'success',
          data: maskedIdCard
        };
        
      case 'maskBankCard':
        // 银行卡脱敏
        const { bankCard } = params;
        const maskedBankCard = maskBankCard(bankCard);
        return {
          code: 0,
          message: 'success',
          data: maskedBankCard
        };
        
      case 'getEncryptionKey':
        // 获取加密密钥（仅用于调试）
        const key = getEncryptionKey();
        return {
          code: 0,
          message: 'success',
          data: { keyExists: !!key }
        };
        
      default:
        return {
          code: 400,
          message: `未知操作: ${action}`,
          data: null
        };
    }
  } catch (error) {
    console.error('加密云函数错误:', error);
    return {
      code: error.code || 500,
      message: error.message || 'internal error',
      data: null
    };
  }
};