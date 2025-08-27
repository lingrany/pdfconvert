const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const fs = require('fs-extra');
const WebsiteCrawler = require('./src/crawler');
const PDFGenerator = require('./src/pdfGenerator');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors({
    origin: ['chrome-extension://*', 'moz-extension://*', 'http://localhost:*'],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 确保输出目录存在
fs.ensureDirSync(path.join(__dirname, 'output'));

// WebSocket连接管理
const clients = new Map();

wss.on('connection', (ws) => {
    const clientId = Math.random().toString(36).substr(2, 9);
    clients.set(clientId, ws);
    
    console.log(`客户端连接: ${clientId}`);
    
    ws.on('close', () => {
        clients.delete(clientId);
        console.log(`客户端断开: ${clientId}`);
    });
    
    // 发送客户端ID
    ws.send(JSON.stringify({
        type: 'connection',
        clientId: clientId
    }));
});

// 向特定客户端发送消息
function sendToClient(clientId, message) {
    const client = clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
    }
}

// 广播消息到所有客户端
function broadcast(message) {
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// API路由

// 单页面转换API（供插件使用）
app.post('/api/convert-page', async (req, res) => {
    try {
        const { url, title, content, options = {}, mode = 'single-page' } = req.body;

        if (!url) {
            return res.status(400).json({ error: '请提供有效的URL' });
        }

        console.log(`开始${mode === 'single-page' ? '单页面' : ''}转换: ${title || url}`);
        console.log('转换选项:', options);

        let pageData;
        
        if (mode === 'single-page') {
            // 单页面模式：使用爬虫抓取单个页面，但不抓取链接
            console.log('单页面模式：使用爬虫抓取当前页面内容');
            
            const WebsiteCrawler = require('./src/crawler');
            const crawler = new WebsiteCrawler({
                maxDepth: 1,  // 深度设为1，可以处理初始页面但不跟踪链接
                maxPages: 1,  // 只抓取1页
                delay: 500,
                includeImages: options.includeImages !== false,
                includeStyles: options.includeStyles !== false,
                onProgress: (progress) => {
                    console.log(`抓取进度: ${progress.message}`);
                }
            });
            
            // 抓取单个页面
            const pages = await crawler.crawl(url);
            
            if (!pages || pages.length === 0) {
                throw new Error('无法抓取页面内容，请检查URL是否可访问');
            }
            
            pageData = pages;
            console.log(`单页面抓取完成，获得 ${pageData.length} 个页面`);
            if (pageData.length > 0) {
                console.log(`内容长度: ${pageData[0].content?.length || 0}`);
                console.log(`内容预览: ${(pageData[0].content || '').substring(0, 200)}...`);
                console.log(`标题: ${pageData[0].title}`);
            }
            
        } else {
            // 备用模式：如果没有内容，则创建空内容
            console.log('备用模式：使用提供的HTML内容');
            pageData = [{
                url: url,
                title: title || 'Untitled',
                content: content || '<html><body><h1>No Content</h1><p>Unable to extract page content.</p></body></html>',
                depth: 0,
                source: 'fallback'
            }];
        }

        // 生成PDF
        const pdfGenerator = new PDFGenerator({
            ...options,
            onProgress: (progress) => {
                console.log(`PDF生成进度: ${progress.percentage}%`);
            }
        });
        
        let pdfPath;
        console.log(`强制使用单页面PDF生成模式`);
        // 强制使用单页面模式
        const urlObj = new URL(url);
        const siteName = urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '_');
        const timestamp = require('moment')().format('YYYY-MM-DD_HH-mm-ss');
        const filename = `${siteName}_single_${timestamp}.pdf`;
        pdfPath = require('path').join(__dirname, 'output', filename);
        
        console.log(`单页面PDF输出路径: ${pdfPath}`);
        await pdfGenerator.generateSinglePagePDF(pageData[0], pdfPath);

        // 读取PDF文件并返回
        const pdfBuffer = await fs.readFile(pdfPath);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title || 'page')}.pdf"`);
        res.send(pdfBuffer);

        console.log(`单页面转换完成: ${title} (模式: ${mode})`);

        // 清理临时文件
        setTimeout(() => {
            fs.unlink(pdfPath).catch(console.error);
        }, 5000);

    } catch (error) {
        console.error('页面转换错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 调试API - 单页面转换
app.post('/api/debug-convert', async (req, res) => {
    try {
        const { url, title, options = {}, mode = 'single-page' } = req.body;
        
        const debugInfo = {
            receivedMode: mode,
            receivedOptions: options,
            urlProvided: !!url,
            titleProvided: !!title
        };
        
        console.log('=== 调试信息 ===');
        console.log(JSON.stringify(debugInfo, null, 2));
        
        res.json({
            success: true,
            debugInfo: debugInfo,
            message: '调试信息已输出到控制台'
        });
        
    } catch (error) {
        console.error('调试错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 开始抓取网站
app.post('/api/crawl', async (req, res) => {
    try {
        const {
            url,
            maxDepth = 2,
            maxPages = 50,
            delay = 1000,
            includeImages = true,
            includeStyles = true,
            clientId
        } = req.body;

        if (!url) {
            return res.status(400).json({ error: '请提供有效的URL' });
        }

        // 创建爬虫实例
        const crawler = new WebsiteCrawler({
            maxDepth,
            maxPages,
            delay,
            includeImages,
            includeStyles,
            onProgress: (progress) => {
                sendToClient(clientId, {
                    type: 'progress',
                    data: progress
                });
            }
        });

        // 开始抓取
        const pages = await crawler.crawl(url);
        
        // 输出详细信息
        console.log(`多页面抓取完成，获得 ${pages.length} 个页面`);
        if (pages.length > 0) {
            console.log(`第一个页面内容长度: ${pages[0].content?.length || 0}`);
            console.log(`第一个页面内容预览: ${(pages[0].content || '').substring(0, 200)}...`);
            console.log(`第一个页面标题: ${pages[0].title}`);
        }

        // 生成PDF
        const pdfGenerator = new PDFGenerator({
            onProgress: (progress) => {
                sendToClient(clientId, {
                    type: 'pdf_progress',
                    data: progress
                });
            }
        });

        const pdfPath = await pdfGenerator.generatePDF(pages, url);

        // 发送完成消息
        sendToClient(clientId, {
            type: 'complete',
            data: {
                pdfPath: path.basename(pdfPath),
                totalPages: pages.length,
                fileSize: fs.statSync(pdfPath).size
            }
        });

        res.json({
            success: true,
            pdfPath: path.basename(pdfPath),
            totalPages: pages.length,
            fileSize: fs.statSync(pdfPath).size
        });

    } catch (error) {
        console.error('抓取错误:', error);
        sendToClient(req.body.clientId, {
            type: 'error',
            data: { message: error.message }
        });
        res.status(500).json({ error: error.message });
    }
});

// 下载PDF文件
app.get('/api/download/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'output', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '文件不存在' });
        }

        res.download(filePath, filename, (err) => {
            if (err) {
                console.error('下载错误:', err);
                res.status(500).json({ error: '下载失败' });
            }
        });
    } catch (error) {
        console.error('下载错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取服务器状态
app.get('/api/status', (req, res) => {
    res.json({
        status: 'running',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        activeConnections: clients.size
    });
});

// 清理输出文件
app.delete('/api/cleanup', async (req, res) => {
    try {
        const outputDir = path.join(__dirname, 'output');
        const files = await fs.readdir(outputDir);
        
        for (const file of files) {
            if (file.endsWith('.pdf')) {
                await fs.unlink(path.join(outputDir, file));
            }
        }
        
        res.json({ message: '清理完成', deletedFiles: files.length });
    } catch (error) {
        console.error('清理错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 启动服务器
server.listen(PORT, () => {
    console.log(`🚀 服务器启动成功`);
    console.log(`📍 访问地址: http://localhost:${PORT}`);
    console.log(`🔗 WebSocket地址: ws://localhost:${PORT}`);
    console.log(`📁 输出目录: ${path.join(__dirname, 'output')}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('收到SIGTERM信号，正在关闭服务器...');
    server.close(() => {
        console.log('服务器已关闭');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('收到SIGINT信号，正在关闭服务器...');
    server.close(() => {
        console.log('服务器已关闭');
        process.exit(0);
    });
});

module.exports = { app, server, wss };