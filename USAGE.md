# 快速使用指南

## 🚀 3分钟上手

### 1. 启动服务

```bash
npm install
npm start
```

访问: http://localhost:3000

### 2. Web界面使用

1. 输入网站URL
2. 设置参数（推荐默认值）
3. 点击"开始抓取"
4. 等待PDF生成和下载

### 3. Chrome插件使用

**安装**:
1. 打开 `chrome://extensions/`
2. 启用"开发者模式"
3. 加载 `extension` 文件夹

**使用**:
- 点击插件图标
- 右键菜单 → "转换为PDF"
- 快捷键 `Ctrl+Shift+P`

## 🎯 推荐配置

| 网站类型 | 深度 | 页面数 | 延迟 |
|---------|------|--------|------|
| 小型文档 | 2层 | 30页 | 500ms |
| 中型文档 | 2层 | 50页 | 1000ms |
| 大型文档 | 3层 | 500页 | 1500ms |
| GitBook | 3-4层 | 800页 | 1000ms |

## 🔧 常见问题

### 连接失败
- 检查服务: http://localhost:3000/api/status
- 重启服务: `npm start`

### 插件问题
- 重新加载扩展程序
- 检查权限设置
- 避免在 `chrome://` 页面使用

### PDF生成问题
- 检查磁盘空间
- 减少抓取页面数
- 查看控制台错误日志

## 🔗 测试页面

- [功能测试](http://localhost:3000/test-page.html)
- [插件测试](http://localhost:3000/single-page-test.html)

---

📖 **更多高级功能**: [完整文档](docs/README.md)