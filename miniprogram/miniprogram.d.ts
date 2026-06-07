// 微信小程序全局类型定义

declare namespace WechatMiniprogram {
  interface Wx {
    [key: string]: any;
  }

  namespace App {
    interface Instance<T = any> {
      [key: string]: any;
    }
  }

  interface CanvasContext {
    [key: string]: any;
    measureText(text: string): { width: number };
    beginPath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
    closePath(): void;
  }
}

// wx 全局对象类型
declare const wx: WechatMiniprogram.Wx;

// 简化的 Page 函数类型 - 接受任何对象作为选项
declare function Page<T>(options: T): void;

// App 函数类型
declare function App<T>(options: T): void;

// getApp 函数类型
declare function getApp<T = any>(): WechatMiniprogram.App.Instance<T> & T;

// Component 函数类型
declare function Component<T>(options: T): void;

// 全局类型扩展
interface Window {}
interface Document {}
interface Navigator {}
interface Storage {}
interface Location {}

// 全局函数和对象类型
declare const console: Console;

// TypeScript 5.0+ 不再自动包含 DOM lib，需要手动声明
declare function setTimeout(callback: (...args: any[]) => void, delay: number): number;
declare function clearTimeout(timerId: number): void;
declare function setInterval(callback: (...args: any[]) => void, delay: number): number;
declare function clearInterval(timerId: number): void;
declare function requestAnimationFrame(callback: () => void): number;
declare function cancelAnimationFrame(requestId: number): void;

// 扩展全局对象
interface NodeRequireFunction {
  (module: string): any;
  cache: any;
}
declare const require: NodeRequireFunction;
declare const module: NodeModule;
declare const exports: any;

// 模块系统支持
interface ImportMeta {
  url: string;
}

// Promise 和 async/await 支持
declare const Promise: PromiseConstructor;
