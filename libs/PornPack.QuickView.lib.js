/**
 * @name         PornPack Quick View Library
 * @description  瀑布流卡片小窗预览模块
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
            btn.innerHTML = '预览';

            btn.style.cssText = `
                position: absolute; top: 6px; left: 6px; z-index: 99;
                padding: 4px 10px; border-radius: 4px; border: none;
                background: rgba(123, 94, 167, 0.95); color: #fff;
                font-size: 12px; font-weight: bold; cursor: pointer;
                box-shadow: 0 2px 6px rgba(0,0,0,0.4); transition: all 0.2s;
            `;
            btn.onmouseover = () => btn.style.background = 'rgba(123, 94, 167, 1)';
            btn.onmouseout = () => btn.style.background = 'rgba(123, 94, 167, 0.95)';

            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openModal(card, a.href);
            };
            card.appendChild(btn);
        });
    }

    openModal(card, url) {
        const overlayId = 'west-quick-view-modal';
        if (document.getElementById(overlayId)) document.getElementById(overlayId).remove();

        // 🌟 性能优化 1：冻结背景网页的滚动和重绘
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.85); z-index: 999999;
            display: flex; justify-content: center; align-items: center;
        `;

        const box = document.createElement('div');
        // 🌟 性能优化 2：强制开启 GPU 硬件加速 (translateZ 和 will-change)
        box.style.cssText = `
            width: 95%; max-width: 850px; max-height: 90vh;
            background: #fdfdfd; border-radius: 12px; overflow-y: auto; overflow-x: hidden;
            box-shadow: 0 10px 40px rgba(0,0,0,0.6); position: relative;
            padding: 20px; transform: translateZ(0); will-change: transform;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✖';
        closeBtn.style.cssText = `
            position: absolute; top: 15px; right: 15px; background: rgba(0,0,0,0.5); border: none;
            width: 32px; height: 32px; border-radius: 50%; display: flex; justify-content: center; align-items: center;
            font-size: 16px; color: #fff; cursor: pointer; z-index: 10; transition: background 0.2s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.background = '#ff4d4f';
        closeBtn.onmouseout = () => closeBtn.style.background = 'rgba(0,0,0,0.5)';
        
        const closeModal = () => {
            overlay.remove();
            // 恢复背景滚动
            document.body.style.overflow = originalOverflow;
        };
        closeBtn.onclick = closeModal;
        overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

        document.body.appendChild(overlay);
        overlay.appendChild(box);

        try {
            // 本地极速提取数据
            const details = window.PornParser.parseWaterfallDetails(card);

            // 提取封面 (尝试替换 URL 获取更高清的版本，如果失败回退到原图)
            const img = card.querySelector('img');
            let coverSrc = img ? (img.src || img.getAttribute('data-src') || '') : '';
            // 简单清洗：有时候缩略图带有尺寸参数，去掉它能拿到大图
            details.coverUrl = coverSrc;

            if (!details.actor || details.actor === 'Unknown_Actor') {
                if (location.href.includes('/performers/')) {
                    const h1 = document.querySelector('h1');
                    if (h1) {
                        details.actor = h1.textContent.trim().split('(')[0].trim();
                        details.actors = [details.actor];
                    }
                } else {
                    const perfTags = Array.from(card.querySelectorAll('a[href*="/performers/"]'));
                    if (perfTags.length) {
                        details.actors = perfTags.map(a => a.textContent.trim());
                        details.actor = details.actors.join(' & ');
                    }
                }
            }

            if (details.maker && details.titlePart.toLowerCase().startsWith(details.maker.toLowerCase())) {
                let cleanT = details.titlePart.substring(details.maker.length).trim();
                details.fullTitle = window.PornParser.slugify(`${details.maker}.${details.dateStr} ${cleanT}`);
            }
            details.url = url;
            details.isValid = !!(details.dateStr && details.titlePart);

            box.appendChild(closeBtn);

            // 🌟 UI 重构：大封面置顶，信息居中
            const contentHtml = `
                <div style="width: 100%; height: 350px; background: #000; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: center; align-items: center; overflow: hidden; box-shadow: inset 0 0 20px rgba(0,0,0,0.8);">
                    <img src="${details.coverUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5));" onerror="this.style.display='none'">
                </div>

                <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px dashed #e4e7ed;">
                    <h2 style="font-size: 22px; margin: 0; color: #303133; line-height: 1.4; text-align: center; max-width: 90%; word-break: break-all;">${details.titlePart}</h2>
                    
                    <div style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap; color: #606266; font-size: 14px; margin-top: 8px; background: #f4f4f5; padding: 10px 20px; border-radius: 6px;">
                        <span><strong style="color:#909399;">厂商:</strong> ${details.maker}</span>
                        <span style="color:#dcdfe6;">|</span>
                        <span><strong style="color:#909399;">日期:</strong> ${details.dateStr}</span>
                        <span style="color:#dcdfe6;">|</span>
                        <span><strong style="color:#909399;">演员:</strong> ${details.actor}</span>
                        <span style="color:#dcdfe6;">|</span>
                        <span><strong style="color:#909399;">番号:</strong> <span style="color:#e74c3c; font-weight:bold; letter-spacing: 1px;">${details.matchPrefix || '未生成'}</span></span>
                    </div>

                    <div style="margin-top: 15px;">
                        <a href="${url}" target="_blank" style="display:inline-flex; align-items:center; gap:6px; padding:8px 24px; background:#7b5ea7; color:#fff; text-decoration:none; border-radius:20px; font-size:14px; font-weight:bold; box-shadow: 0 4px 10px rgba(123, 94, 167, 0.3); transition:all 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 15px rgba(123, 94, 167, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 10px rgba(123, 94, 167, 0.3)';">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            访问完整详情页
                        </a>
                    </div>
                </div>

                <div class="x-west-wrap" id="qv-west-wrap" style="border:none; padding:0!important; background:transparent; margin-bottom: 0;">
                    <div style="font-weight: bold; font-size: 16px; margin-bottom: 12px; display:flex; align-items:center; color:#303133;">
                        <span style="display:inline-block; width:4px; height:16px; background:#19c5b7; margin-right:8px; border-radius:2px;"></span>
                        115 智能控制台
                        <span class="west-match-status" style="font-size:12px; color:#909399; margin-left:12px; font-weight: normal; background: #f4f4f5; padding: 2px 8px; border-radius: 10px;">等待搜索...</span>
                    </div>
                    <div class="west-match-list" style="width:100%; display:flex; flex-direction:column;"></div>
                    <div class="west-magnet-slot" style="margin-top: 15px;"></div>
                </div>
            `;
            box.insertAdjacentHTML('beforeend', contentHtml);

            const wrap = box.querySelector('#qv-west-wrap');
            wrap.WESTDETAILS = details;

            const magnetSlot = wrap.querySelector('.west-magnet-slot');
            const widget = this.magnetUI.createMagnetWidget(details);
            magnetSlot.appendChild(widget);

            this.doAutoMatch(wrap, details);

        } catch (e) {
            box.innerHTML = `<div style="text-align:center; padding: 60px; color: #dc3545; font-size: 16px; font-weight:bold;">抱歉，解析该卡片失败: ${e.message}</div>`;
            box.appendChild(closeBtn);
        }
    }
};