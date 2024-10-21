import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  // 基本公共路径
  base: './',

  // 构建配置
  build: {
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, 'src/liteofd/liteOfd.ts'),
      name: 'liteOfd',
      // the proper extensions will be added
      fileName: 'lite-ofd',
    },
    outDir: 'dist', // 输出目录
    assetsDir: '', // 将静态资源目录设置为空字符串
    minify: 'terser', // 混淆器
    terserOptions: {
      compress: {
        drop_console: true, // 去除 console
        drop_debugger: true // 去除 debugger
      }
    },
    rollupOptions: {
      external: ['@lapo/asn1js', 'fast-xml-parser', 'js-md5', 'js-sha1', 'jsrsasign', 'jsrsasign-util', 'jszip', 'jszip-utils', 'sm-crypto', 'xmlbuilder2'],
      output: {
        globals: {
          '@lapo/asn1js': 'ASN1',
          'fast-xml-parser': 'fastXmlParser',
          'js-md5': 'md5',
          'js-sha1': 'sha1',
          'jsrsasign': 'jsrsasign',
          'jsrsasign-util': 'jsrsasignUtil',
          'jszip': 'JSZip',
          'jszip-utils': 'JSZipUtils',
          'sm-crypto': 'smCrypto',
          'xmlbuilder2': 'xmlbuilder2'
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && (assetInfo.name.endsWith('.ttf') || assetInfo.name.endsWith('.otf'))) {
            return 'assets/fonts/[name][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      }
    },
    emptyOutDir: false
  },

  // 服务器选项
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true, // 自动打开浏览器
    cors: true, // 允许跨域
  },

  // 解析选项
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'), // 设置 @ 指向 src 目录
    },
  },

  // 插件
  plugins: [
    // 这里可以添加 Vite 插件
  ],

  publicDir: 'public'
})
