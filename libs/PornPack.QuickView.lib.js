/**
 * @name         PornPack Quick View Library
 * @description  瀑布流卡片小窗预览模块 (静默抓取详情并渲染控制台)
 * @version      1.0.0
 */

window.PornQuickView = class PornQuickView {
    constructor(options) {
        this.gmFetch = options.gmFetch;
        this.magnetUI = options.magnetUI;
        this.doAutoMatch = options.doAutoMatch;
    }

    // 1. 在瀑布流卡片左上角注入按钮
    ensureButtons(doc) {
        doc.querySelectorAll('.w-scene-card').forEach(card => {
            if (card.querySelector('.west-quick-view-btn')) return;
            
            // 提取跳转详情页的链接
            const a = card.querySelector('a[href*="/scenes/"]');
            if (!a) return;
            
            // 确保卡片是 relative 定位，以便按钮绝对定位在左上角
            if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
            
            const btn = document.createElement('button');
            btn.className = 'west-quick-view-btn';
            btn.innerHTML = '🔍 小窗预览';
            
            // 左上角样式设计
            btn.style.cssText = `
                position: absolute; top: 6px; left: 6px; z-index: 999;
                padding: 4px 8px; border-radius: 4px; border: none;
                background: rgba(123, 94, 167, 0.9); color: #fff;
                font-size: 12px; font-weight: bold; cursor: pointer;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: all 0.2s;
            `;
            btn.onmouseover = () => btn.style.background = 'rgba(123, 94, 167, 1)';
            btn.onmouseout = () => btn.style.background = 'rgba(123, 94, 167, 0.9)';
            
            // 点击事件：拦截跳转，打开弹窗
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openModal(a.href);
            };
            card.appendChild(btn);
        });
    }

    // 2. 弹窗与抓取渲染核心逻辑
    async openModal(url) {
        const overlayId = 'west-quick-view-modal';
        let overlay = document.getElementById(overlayId);
        if (overlay) overlay.remove(); // 防止重复点击

        // 创建全屏遮罩
        overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.6); z-index: 999999;
            display: flex; justify-content: center; align-items: center;
            backdrop-filter: blur(4px);
        `;

        // 创建居中弹窗盒
        const box = document.createElement('div');
        box.style.cssText = `
            width: 90%; max-width: 900px; max-height: 90vh;
            background: #fdfdfd; border-radius: 12px; overflow-y: auto;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3); position: relative;
            padding: 20px;
        `;
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✖';
        closeBtn.style.cssText = `
            position: absolute; top: 15px; right: 15px; background: none; border: none;
            font-size: 20px; color: #666; cursor: pointer; z-index: 10;
        `;
        closeBtn.onclick = () => overlay.remove();
        
        box.innerHTML = `<div style="text-align:center; padding: 50px; color: #666; font-size:16px;">🔄 正在极速抓取影片数据...</div>`;
        box.appendChild(closeBtn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // 点击背景也可以关闭弹窗
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        try {
            // 后台静默抓取 HTML
            const res = await this.gmFetch(url);
            if (!res.loadstuts) throw new Error('网络请求超时或失败');
            
            // 将文本转换为虚拟 DOM
            const parser = new DOMParser();
            const virtualDoc = parser.parseFromString(res.responseText, 'text/html');
            
            // 复用 Parser 模块，解析虚拟 DOM 拿数据
            const details = window.PornParser.parseWestDetails(virtualDoc);
            details.url = url; 
            if (!details.isValid) throw new Error('页面特征解析失败，可能是不支持的页面结构');

            box.innerHTML = '';
            box.appendChild(closeBtn);
            
            // 组装上半部分：影片资料 UI
            const contentHtml = `
                <div style="display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; padding-bottom: 15px; border-bottom: 1px dashed #eee;">
                    <div style="flex-shrink: 0; width: 220px;">
                        <img src="${details.coverUrl}" style="width: 100%; border-radius: 8px; object-fit: cover; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" onerror="this.style.display='none'">
                    </div>
                    <div style="flex: 1; min-width: 300px;">
                        <h2 style="font-size: 20px; margin-top: 0; margin-bottom: 12px; color: #333; line-height: 1.4;">${details.titlePart}</h2>
                        <p style="margin: 6px 0; font-size: 14px;"><strong style="color:#555; display:inline-block; width:45px;">厂商:</strong> ${details.maker}</p>
                        <p style="margin: 6px 0; font-size: 14px;"><strong style="color:#555; display:inline-block; width:45px;">日期:</strong> ${details.dateStr}</p>
                        <p style="margin: 6px 0; font-size: 14px;"><strong style="color:#555; display:inline-block; width:45px;">演员:</strong> ${details.actor}</p>
                        <p style="margin: 6px 0; font-size: 14px;"><strong style="color:#555; display:inline-block; width:45px;">番号:</strong> ${details.matchPrefix || '无'}</p>
                        <div style="margin-top: 15px;">
                            <a href="${url}" target="_blank" style="display:inline-block; padding:6px 16px; background:#f4f4f5; color:#606266; text-decoration:none; border-radius:6px; font-size:13px; font-weight:bold; border:1px solid #dcdfe6; transition:all 0.2s;" onmouseover="this.style.background='#e8e8e8'" onmouseout="this.style.background='#f4f4f5'">🔗 新标签页打开</a>
                        </div>
                    </div>
                </div>
                <div class="x-west-wrap" id="qv-west-wrap" style="border:none; padding:0!important; background:transparent;">
                    <div style="font-weight: bold; font-size: 16px; margin-bottom: 8px; display:flex; align-items:center;">
                        115 智能控制台
                        <span class="west-match-status" style="font-size:12px; color:#888; margin-left:8px; font-weight: normal;">等待搜索...</span>
                    </div>
                    <div class="west-match-list" style="width:100%; display:flex; flex-direction:column;"></div>
                    <div class="west-magnet-slot"></div>
                </div>
            `;
            box.insertAdjacentHTML('beforeend', contentHtml);
            
            // 最关键的一步：给容器挂上 details 变量，这样按钮点击事件才知道它操作的是哪部影片
            const wrap = box.querySelector('#qv-west-wrap');
            wrap.WESTDETAILS = details; 
            
            // 挂载磁力面板
            const magnetSlot = wrap.querySelector('.west-magnet-slot');
            const widget = this.magnetUI.createMagnetWidget(details);
            magnetSlot.appendChild(widget);
            
            // 触发 115 并发匹配渲染
            this.doAutoMatch(wrap, details);
            
        } catch (e) {
            box.innerHTML = `<div style="text-align:center; padding: 50px; color: #dc3545; font-size: 16px;">❌ 抓取失败: ${e.message}</div>`;
            box.appendChild(closeBtn);
        }
    }
};