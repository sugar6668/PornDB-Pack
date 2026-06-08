/**
 * @name         PornPack Bookmark Library
 * @description  PornDB 时间轴导出为 PotPlayer 书签核心模块 (下拉双年份切换版)
 * @version      1.1.0
 */

window.PornBookmark = class PornBookmark {
    static BTN_ID = 'export-pbf-btn';
    static GROUP_ID = 'export-pbf-group'; // 容器 ID

    // 1. 模块初始化入口
    static init() {
        this.ensureButtonExists();
        setInterval(() => this.ensureButtonExists(), 1500);
    }

    // 2. 寻找注入锚点并注入下拉按钮组
    static ensureButtonExists() {
        if (!location.href.includes('/scenes/')) return;
        const targetAnchor = document.getElementById('btn-copy-kw');
        
        // 确保容器不存在时才注入，防止重复生成
        if (targetAnchor && !document.getElementById(this.GROUP_ID)) {
            this.createExportButton(targetAnchor);
        }
    }

    // 3. 核心：获取标准化文件名，根据 yearMode (4或2) 智能处理年份
    static getStandardizedFilename(yearMode = 4) {
        try {
            let finalName = "";
            if (window.PornParser) {
                const details = window.PornParser.parseWestDetails(document);
                if (details && details.isValid) {
                    let cleanRawTitle = details.titlePart || details.title || "";
                    let maker = details.maker ? details.maker.trim() : "";
                    
                    if (maker && cleanRawTitle.toLowerCase().startsWith(maker.toLowerCase())) {
                        cleanRawTitle = cleanRawTitle.substring(maker.length).replace(/^[^a-zA-Z0-9\u4e00-\u9fa5]+/, '').trim();
                    }
                    
                    finalName = details.matchPrefix 
                        ? `${details.matchPrefix} ${cleanRawTitle}` 
                        : (details.fullTitle || cleanRawTitle);
                }
            }
            
            // 如果解析失败，走兜底
            if (!finalName) {
                finalName = document.title;
            }

            // 🌟 核心处理：如果需要两位数年份，进行正则替换
            if (yearMode === 2) {
                // 精准匹配： 19或20开头 + 两位数年份 + 分隔符(.-) + 月份 + 分隔符 + 日期
                // 例如将 2024.01.05 替换为 24.01.05
                finalName = finalName.replace(/(?:19|20)(\d{2})([.-])(0[1-9]|1[0-2])\2(0[1-9]|[12]\d|3[01])/g, "$1$2$3$2$4");
            }

            return finalName.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || "视频时间轴书签";
            
        } catch (e) {
            console.error("命名逻辑执行失败:", e);
            return "视频时间轴书签";
        }
    }

    // 4. 创建带下拉菜单的分体式按钮
    static createExportButton(targetAnchor) {
        // --- 外层容器 ---
        const group = document.createElement('div');
        group.id = this.GROUP_ID;
        group.style.cssText = 'display: inline-flex; position: relative; margin-left: 4px; align-items: center;';

        // --- 左侧：主按钮（默认4位年份导出）---
        const mainBtn = document.createElement('button');
        mainBtn.id = this.BTN_ID;
        mainBtn.className = 'west-engine-btn';
        mainBtn.innerHTML = '⬇️ 导出书签';
        mainBtn.style.cssText = 'background: #e6a23c; border-color: #e6a23c; color: #fff; border-top-right-radius: 0; border-bottom-right-radius: 0;';
        mainBtn.onmouseover = () => mainBtn.style.backgroundColor = '#ebb563';
        mainBtn.onmouseout = () => mainBtn.style.backgroundColor = '#e6a23c';
        mainBtn.onclick = () => this.handleExport(4); 

        // --- 右侧：下拉触发按钮 ---
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'west-engine-btn';
        toggleBtn.innerHTML = '▼';
        // 利用半透明白色做出分割线效果
        toggleBtn.style.cssText = 'background: #e6a23c; border-color: #e6a23c; color: #fff; border-left: 1px solid rgba(255,255,255,0.4); border-top-left-radius: 0; border-bottom-left-radius: 0; padding: 6px 8px;';
        toggleBtn.onmouseover = () => toggleBtn.style.backgroundColor = '#ebb563';
        toggleBtn.onmouseout = () => toggleBtn.style.backgroundColor = '#e6a23c';

        // --- 下拉菜单面板 ---
        const menu = document.createElement('div');
        menu.style.cssText = 'display: none; position: absolute; top: 100%; right: 0; margin-top: 6px; background: #fff; border: 1px solid #e4e7ed; border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.15); z-index: 99999; flex-direction: column; min-width: 140px; overflow: hidden;';

        // 菜单项 1：完整年份
        const item4 = document.createElement('div');
        item4.innerHTML = '✅ 完整年份 (YYYY)';
        item4.style.cssText = 'padding: 10px 14px; font-size: 13px; font-weight: 500; color: #606266; cursor: pointer; transition: background 0.2s;';
        item4.onmouseover = () => item4.style.backgroundColor = '#f5f7fa';
        item4.onmouseout = () => item4.style.backgroundColor = 'transparent';
        item4.onclick = () => { menu.style.display = 'none'; this.handleExport(4); };

        // 菜单项 2：两位数年份
        const item2 = document.createElement('div');
        item2.innerHTML = '✂️ 两位年份 (YY)';
        item2.style.cssText = 'padding: 10px 14px; font-size: 13px; font-weight: 500; color: #606266; cursor: pointer; transition: background 0.2s; border-top: 1px solid #ebeef5;';
        item2.onmouseover = () => item2.style.backgroundColor = '#f5f7fa';
        item2.onmouseout = () => item2.style.backgroundColor = 'transparent';
        item2.onclick = () => { menu.style.display = 'none'; this.handleExport(2); };

        menu.appendChild(item4);
        menu.appendChild(item2);

        // --- 事件绑定 ---
        toggleBtn.onclick = (e) => {
            e.stopPropagation(); // 阻止冒泡，防止触发下面的全局关闭
            menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
        };

        // 点击页面其他区域自动关闭菜单
        document.addEventListener('click', () => {
            if (menu.style.display === 'flex') menu.style.display = 'none';
        });

        // --- 拼装 ---
        group.appendChild(mainBtn);
        group.appendChild(toggleBtn);
        group.appendChild(menu);

        targetAnchor.insertAdjacentElement('afterend', group);
    }

    // 5. 抓取时间轴与格式转换逻辑 (接收 yearMode)
    static handleExport(yearMode = 4) {
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
                     pbfContent += `${validBookmarksCount}=${ms}*${titleText}*\r\n`;
                     validBookmarksCount++;
                }
            }
        });

        if (validBookmarksCount > 0) {
            // 透传 yearMode 给命名函数
            const finalName = this.getStandardizedFilename(yearMode);
            this.downloadFile(pbfContent, `${finalName}.pbf`);
            
            // UI 反馈
            const mainBtn = document.getElementById(this.BTN_ID);
            const originalText = mainBtn.innerHTML;
            
            mainBtn.innerHTML = `✅ 成功 (${validBookmarksCount})`;
            mainBtn.style.backgroundColor = '#67c23a';
            mainBtn.style.borderColor = '#67c23a';
            
            setTimeout(() => {
                mainBtn.innerHTML = originalText;
                mainBtn.style.backgroundColor = '#e6a23c';
                mainBtn.style.borderColor = '#e6a23c';
            }, 3000);
            
        } else {
            alert("未能提取到有效的时间标签！");
        }
    }

    // 6. 触发本地文件下载机制 (强制 UTF-16 LE 编码，完美兼容 PotPlayer)
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