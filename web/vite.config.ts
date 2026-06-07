import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import compression from 'vite-plugin-compression';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve';

  return {
    plugins: [
      vue(),
      Components({
        dts: false,
        resolvers: [
          ElementPlusResolver({
            importStyle: false
          })
        ],
        dirs: [
          resolve(__dirname, 'src/components')
        ]
      }),
      // 生产环境启用gzip压缩
      !isDev && compression({
        verbose: true,
        disable: false,
        threshold: 10240, // 10KB以上压缩
        algorithm: 'gzip',
        ext: '.gz'
      })
    ].filter(Boolean),
    
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },

    server: {
      port: 3000,
      open: true,
      proxy: {
        '/api': {
          target: 'https://tcb-api.tencentcloudapi.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },

    // 确保 SPA 路由正常工作
    preview: {
      port: 3000
    },

    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler'
        }
      }
    },

    build: {
      // 构建产物目录（CloudBase 默认识别 dist）
      outDir: 'dist',
      assetsDir: 'assets',
      
      // 代码分割优化
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;

            if (id.includes('/xlsx/')) return 'xlsx';
            if (id.includes('/echarts/')) return 'echarts';
            if (id.includes('/@element-plus/icons-vue/')) return 'element-plus-icons';
            if (id.includes('/element-plus/')) return 'element-plus';
            if (id.includes('/vue-router/') || id.includes('/pinia/') || id.includes('/vue/')) {
              return 'vue-ecosystem';
            }
            if (id.includes('/axios/') || id.includes('/dayjs/') || id.includes('/nprogress/')) {
              return 'utils';
            }
          },
          // 优化chunk命名，便于缓存控制
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split('.');
            const ext = info[info.length - 1];
            if (/png|jpe?g|gif|svg|webp/.test(ext)) {
              return `assets/img/[name]-[hash][extname]`;
            } else if (/woff|woff2|eot|ttf|otf/.test(ext)) {
              return `assets/fonts/[name]-[hash][extname]`;
            } else if (ext === 'css') {
              return `assets/css/[name]-[hash][extname]`;
            }
            return `assets/[name]-[hash][extname]`;
          }
        }
      },

      // 性能优化
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true
        }
      },
      
      // 分析构建大小
      reportCompressedSize: false,
      
      // 缓存策略
      sourcemap: false, // 生产环境关闭sourcemap
      emptyOutDir: true,
      
      // 提升并行度
      write: true,
      
      // 增大limits以适应Element Plus大小
      chunkSizeWarningLimit: 2000
    },

    envPrefix: 'VITE_',
    
    // 优化依赖预构建
    optimizeDeps: {
      include: [
        'vue',
        'vue-router',
        'pinia',
        '@element-plus/icons-vue',
        'axios',
        'dayjs'
      ]
    }
  };
});
