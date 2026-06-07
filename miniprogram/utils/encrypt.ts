// utils/encrypt.ts - 加密工具（可选）
// 注意：云开发已通过 HTTPS 传输，建议在云函数端加密敏感数据

function encrypt(data: any): string {
  // 直接 JSON.stringify 传输，由云函数负责加密存储
  return JSON.stringify(data);
}

function decrypt(encrypted: string): any {
  return JSON.parse(encrypted);
}

// 如果需要前端加密（如身份证），可以使用简单的 Base64（但不安全）
// 生产环境建议：前端不加密，只通过 HTTPS 传输，云函数端 AES-GCM 加密

function simpleEncrypt(text: string): string {
  // 微信小程序环境中使用 wx.base64
  const base64 = (wx as any).base64;
  if (base64) {
    const textEncoder = new TextEncoder();
    const arrayBuffer = textEncoder.encode(text).buffer;
    return base64.encodeArrayBuffer(arrayBuffer);
  }
  // 降级处理：直接返回原文本
  return text;
}

function simpleDecrypt(encoded: string): string {
  // 微信小程序环境中使用 wx.base64
  const base64 = (wx as any).base64;
  if (base64) {
    const arrayBuffer = base64.decodeToArrayBuffer(encoded);
    const textDecoder = new TextDecoder();
    return textDecoder.decode(arrayBuffer);
  }
  // 降级处理：直接返回原文本
  return encoded;
}

// 使用 CommonJS 导出以兼容小程序模块系统
module.exports = {
  encrypt,
  decrypt,
  simpleEncrypt,
  simpleDecrypt
};

export {};
