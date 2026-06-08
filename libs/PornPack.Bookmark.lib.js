/**
 * @name         PornPack Bookmark Library
 * @description  PornDB 时间轴导出为 PotPlayer 书签核心模块 (控制台 UI 融合版)
 * @version      1.0.0
 */

window.PornBookmark = class PornBookmark {
    static BTN_ID = 'export-pbf-btn';

    // 1. 模块初始化入口
    static init() {
        this.ensureButtonExists();
        // 监听动态页面切换与控制台渲染延迟
        setInterval(() => this.ensureButtonExists(), 1500);
    }

    // 2. 寻找注入锚点并注入按钮
    static ensureButtonExists() {
        if (!location.href.includes('/scenes/')) return;

        // 目标锚点：寻找磁力控制台中的“复制词条”按钮
        const targetAnchor = document.getElementById('btn-copy-kw');
        
        // 如果磁力控制台已渲染，且书签按钮尚未注入
        if (targetAnchor && !document.getElementById(this.BTN_ID)) {
            this.createExportButton(targetAnchor);
        }
    }

    // 3. 核心：获取标准化文件名 (完美复刻主脚本命名逻辑)
    static getStandardizedFilename() {
        try {
            if (window.PornParser) {
                const details = window.PornParser.parseWestDetails(document);
                if (details && details.isValid) {
                    let cleanRawTitle = details.titlePart || details.title || "";
                    let maker = details.maker ? details.maker.trim() : "";
                    
                    if (maker && cleanRawTitle.toLowerCase().startsWith(maker.toLowerCase())) {
                        cleanRawTitle = cleanRawTitle.substring(maker.length).replace(/^[^a-zA-Z0-9\u4e00-\u9fa5]+/, '').trim();
                    }
                    
                    let cleanNewName = details.matchPrefix 
                        ? `${details.matchPrefix} ${cleanRawTitle}` 
                        : (details.fullTitle || cleanRawTitle);
                    
                    cleanNewName = cleanNewName.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
                    return cleanNewName || "视频时间轴书签";
                }
            }
            return document.title.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, ' ').trim();
        } catch (e) {
            console.error("命名逻辑执行失败:", e);
            return "视频时间轴书签";
        }
    }

    // 4. 创建融入控制台 UI 的按钮
    static createExportButton(targetAnchor) {
        const btn = document.createElement('button');
        btn.id = this.BTN_ID;
        // 关键点：复用主脚本定义的 UI 样式类
        btn.className = 'west-engine-btn';
        btn.innerHTML = '⬇️ 导出书签';
        
        // 增加专属颜色（使用橘黄色，与现有的绿、白按钮区分开），并设置左侧间距
        btn.style.cssText = `
            background: #e6a23c;
            border-color: #e6a23c;
            color: #fff;
            margin-left: 4px;
        `;
        
        // 覆盖默认样式的 hover 颜色
        btn.onmouseover = () => btn.style.backgroundColor = '#ebb563';
        btn.onmouseout = () => btn.style.backgroundColor = '#e6a23c';
        
        btn.addEventListener('click', () => this.handleExport());
        
        // 关键点：将其插入到“复制词条”按钮之后
        targetAnchor.insertAdjacentElement('afterend', btn);
    }

    // 5. 抓取时间轴与格式转换逻辑
    static handleExport() {
        // 关键修复 1：使用 Windows 原生换行符 \r\n
        let pbfContent = "[Bookmark]\r\n";
        let validBookmarksCount = 0;

        const timelineContainer = document.querySelector('div.flex.flex-wrap.gap-y-5.gap-x-2');
        if (!timelineContainer) {
            alert("未检测到时间轴数据！");
            return;
        }

        const items = timelineContainer.querySelectorAll('div.text-sm.rounded-sm');
        if (items.length === 0) {
            alert("未在容器内找到时间轴节点！");
            return;
        }

        items.forEach((item) => {
            const titleSpan = item.querySelector('span.text-white.bg-gray-800.p-2.rounded-l');
            const timeSpan = item.querySelector('span.text-gray-800.bg-gray-200.p-2.rounded-r');

            if (titleSpan && timeSpan) {
                const titleText = titleSpan.innerText.replace(/['"]/g, '').trim();
                const timeText = timeSpan.innerText.replace(/['"]/g, '').trim();
                
                let ms = 0;
                let timeParts = timeText.split(':').map(Number);
                
                if (timeParts.length === 3) { 
                    ms = (timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2]) * 1000;
                } else if (timeParts.length === 2) { 
                    ms = (timeParts[0] * 60 + timeParts[1]) * 1000;
                }

                if (!isNaN(ms) && ms >= 0 && timeText !== "") {
                     // 关键修复 2：在末尾追加一个 '*'，让 PotPlayer 解析引擎认为缩略图部分为空，而不是格式错误
                     pbfContent += `${validBookmarksCount}=${ms}*${titleText}*\r\n`;
                     validBookmarksCount++;
                }
            }
        });

        if (validBookmarksCount > 0) {
            const finalName = this.getStandardizedFilename();
            this.downloadFile(pbfContent, `${finalName}.pbf`);
            
            const btn = document.getElementById(this.BTN_ID);
            const originalText = btn.innerHTML;
            
            btn.innerHTML = `✅ 已导出 (${validBookmarksCount})`;
            btn.style.backgroundColor = '#67c23a';
            btn.style.borderColor = '#67c23a';
            
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.backgroundColor = '#e6a23c';
                btn.style.borderColor = '#e6a23c';
            }, 3000);
            
        } else {
            alert("未能提取到有效的时间标签！");
        }
    }

    // 6. 触发本地文件下载机制 (强制 UTF-16 LE 编码)
    static downloadFile(content, filename) {
        // 关键修复 3：将 JS 原生字符串转换为 UTF-16 LE ArrayBuffer
        const buffer = new ArrayBuffer(content.length * 2);
        const view = new Uint16Array(buffer);
        for (let i = 0; i < content.length; i++) {
            view[i] = content.charCodeAt(i);
        }
        
        // 关键修复 4：在文件头部追加 UTF-16 LE 专用的 BOM (Byte Order Mark: 0xFF 0xFE)
        const bom = new Uint8Array([0xFF, 0xFE]);
        
        // 将 BOM 和转码后的数据合并成二进制 Blob
        const blob = new Blob([bom, buffer], { type: 'application/octet-stream' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }
};