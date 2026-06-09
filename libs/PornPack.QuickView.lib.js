/**
 * @name         PornPack Quick View Library
 * @description  瀑布流卡片小窗预览模块 (本地秒级解析，极低性能损耗)
 * @version      1.0.0
 */

window.PornQuickView = class PornQuickView {
    constructor(options) {
        this.magnetUI = options.magnetUI;
        this.doAutoMatch = options.doAutoMatch;
    }

    ensureButtons(doc) {
        doc.querySelectorAll('.w-scene-card').forEach(card => {
            if (card.querySelector('.west-quick-view-btn')) return;

            const a = card.querySelector('a[href*="/scenes/"]');
            if (!a) return;

            if (getComputedStyle(card).position === 'static') card.style.position = 'relative';

            const btn = document.createElement('button');
            btn.className = 'west-quick-view-btn';
            btn.innerHTML = '小窗预览';

            btn.style.cssText = `
                position: absolute; top: 6px; left: 6px; z-index: 99;
                padding: 4px 8px; border-radius: 4px; border: none;
                background: rgba(123, 94, 167, 0.95); color: #fff;
                font-size: 12px; font-weight: bold; cursor: pointer;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: all 0.2s;
            `;
            btn.onmouseover = () => btn.style.background = 'rgba(123, 94, 167, 1)';
            btn.onmouseout = () => btn.style.background = 'rgba(123, 94, 167, 0.95)';

            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // 传入 card 节点，实现本地秒级提取
                this.openModal(card, a.href);
            };
            card.appendChild(btn);
        });
    }

    openModal(card, url) {
        const overlayId = 'west-quick-view-modal';
        let overlay = document.getElementById(overlayId);
        if (overlay) overlay.remove();

        // 🌟 修复性能问题：干掉 backdrop-filter: blur，换成纯色黑底，CPU 风扇瞬间安静
        overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.75); z-index: 999999;
            display: flex; justify-content: center; align-items: center;
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            width: 90%; max-width: 900px; max-height: 90vh;
            background: #fdfdfd; border-radius: 12px; overflow-y: auto;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); position: relative;
            padding: 20px;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✖';
        closeBtn.style.cssText = `
            position: absolute; top: 15px; right: 15px; background: none; border: none;
            font-size: 20px; color: #666; cursor: pointer; z-index: 10; transition: color 0.2s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.color = '#ff4d4f';
        closeBtn.onmouseout = () => closeBtn.style.color = '#666';
        closeBtn.onclick = () => overlay.remove();

        overlay.appendChild(box);
        document.body.appendChild(overlay);
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        try {
            // 🌟 修复数据问题：不再去后台请求，直接复用刚才抽取好的瀑布流卡片解析功能
            const details = window.PornParser.parseWaterfallDetails(card);

            // 1. 抓取封面图 (就在卡片的 img 标签里)
            const img = card.querySelector('img');
            if (img) details.coverUrl = img.src || img.getAttribute('data-src') || '';

            // 2. 抓取演员 (如果当前在演员专属页面，提取页面顶部的名字)
            if (!details.actor || details.actor === 'Unknown_Actor') {
                if (location.href.includes('/performers/')) {
                    const h1 = document.querySelector('h1');
                    if (h1) {
                        details.actor = h1.textContent.trim().split('(')[0].trim();
                        details.actors = [details.actor];
                    }
                } else {
                    // 如果在混合瀑布流，尝试读取卡片上的演员链接
                    const perfTags = Array.from(card.querySelectorAll('a[href*="/performers/"]'));
                    if (perfTags.length) {
                        details.actors = perfTags.map(a => a.textContent.trim());
                        details.actor = details.actors.join(' & ');
                    }
                }
            }

            // 3. 补全必要字段
            if (details.maker && details.titlePart.toLowerCase().startsWith(details.maker.toLowerCase())) {
                let cleanT = details.titlePart.substring(details.maker.length).trim();
                details.fullTitle = window.PornParser.slugify(`${details.maker}.${details.dateStr} ${cleanT}`);
            }
            details.url = url;
            details.isValid = !!(details.dateStr && details.titlePart);

            box.appendChild(closeBtn);

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
                        <p style="margin: 6px 0; font-size: 14px;"><strong style="color:#555; display:inline-block; width:45px;">番号:</strong> <span style="color:#e74c3c; font-weight:bold;">${details.matchPrefix || '无'}</span></p>
                        <div style="margin-top: 15px;">
                            <a href="${url}" target="_blank" style="display:inline-block; padding:6px 16px; background:#f4f4f5; color:#606266; text-decoration:none; border-radius:6px; font-size:13px; font-weight:bold; border:1px solid #dcdfe6; transition:all 0.2s;" onmouseover="this.style.background='#e8e8e8'" onmouseout="this.style.background='#f4f4f5'">🔗 新标签页进入原网页</a>
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

            const wrap = box.querySelector('#qv-west-wrap');
            wrap.WESTDETAILS = details;

            // 挂载磁力面板
            const magnetSlot = wrap.querySelector('.west-magnet-slot');
            const widget = this.magnetUI.createMagnetWidget(details);
            magnetSlot.appendChild(widget);

            // 触发 115 匹配渲染
            this.doAutoMatch(wrap, details);

        } catch (e) {
            box.innerHTML = `<div style="text-align:center; padding: 50px; color: #dc3545; font-size: 16px;">解析失败: ${e.message}</div>`;
            box.appendChild(closeBtn);
        }
    }
};