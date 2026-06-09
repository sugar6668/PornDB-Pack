/**
 * @name         PornPack Bookmark Library
 * @description  PornDB 时间轴导出为 PotPlayer 书签核心模块
 * @version      1.0.0
 */

window.PornBookmark = class PornBookmark {
    static BTN_ID = 'export-pbf-btn';

    static init() {
        this.ensureButtonExists();
    }

    static ensureButtonExists() {
        if (!location.href.includes('/scenes/')) return;
        const targetAnchor = document.getElementById('btn-copy-kw');
        
        if (targetAnchor && !document.getElementById(this.BTN_ID)) {
            this.createExportButton(targetAnchor);
        }
    }

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
                    
                    return cleanNewName.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || "视频时间轴书签";
                }
            }
            return document.title.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, ' ').trim();
        } catch (e) {
            return "视频时间轴书签";
        }
    }

    static createExportButton(targetAnchor) {
        const btn = document.createElement('button');
        btn.id = this.BTN_ID;
        btn.className = 'west-engine-btn';
        btn.innerHTML = '导出书签';
        
        btn.style.cssText = `
            background: #e6a23c;
            border-color: #e6a23c;
            color: #fff;
            margin-left: 4px;
        `;
        
        btn.onmouseover = () => btn.style.backgroundColor = '#ebb563';
        btn.onmouseout = () => btn.style.backgroundColor = '#e6a23c';
        
        btn.addEventListener('click', () => this.handleExport());
        targetAnchor.insertAdjacentElement('afterend', btn);
    }

    static handleExport() {
        let pbfContent = "[Bookmark]\r\n";
        let validBookmarksCount = 0;

        const timelineContainer = document.querySelector('div.flex.flex-wrap.gap-y-5.gap-x-2');
        if (!timelineContainer) return alert("未检测到时间轴数据！");

        const items = timelineContainer.querySelectorAll('div.text-sm.rounded-sm');
        if (items.length === 0) return alert("未在容器内找到时间轴节点！");

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
                     // 保留末尾星号和回车换行，适配 PotPlayer
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
            
            btn.innerHTML = `已导出 (${validBookmarksCount})`;
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

    // 强行用 UTF-16 LE 编码导出，PotPlayer 专属
    static downloadFile(content, filename) {
        const buffer = new ArrayBuffer(content.length * 2);
        const view = new Uint16Array(buffer);
        for (let i = 0; i < content.length; i++) {
            view[i] = content.charCodeAt(i);
        }
        
        const bom = new Uint8Array([0xFF, 0xFE]);
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