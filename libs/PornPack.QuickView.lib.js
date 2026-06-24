/**
 * @name         PornPack Quick View Library
 * @description  原生 Iframe 级巨幕小窗预览
 * @version      1.0.0
 */

window.PornQuickView = class PornQuickView {
    constructor(options) {
        // 保持格式兼容
    }

    ensureButtons(doc) {
        if (window.self !== window.top) return;

        // 【CPU 性能核武】：只扫描没生成过按钮的新卡片
        const newCards = doc.querySelectorAll('.w-scene-card:not([data-qv-processed="1"])');
        if (!newCards.length) return;

        newCards.forEach(card => {
            // 瞬间打上烙印
            card.dataset.qvProcessed = "1";

            const aNode = card.querySelector('a[href*="/scenes/"]');
            if (!aNode) return;

            // 【核心修复】：脱离 a 标签，直接挂载到最外层卡片 (card) 末尾
            card.style.position = 'relative';

            const btn = doc.createElement('button');
            // [MOD] 使用外部 CSS 类接管样式
            btn.className = 'pdb-qv-static-btn';
            btn.innerHTML = '小窗预览';

            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // [MOD] 传递当前的卡片 DOM 节点，供关闭时精准定位
                this.openIframeModal(aNode.href, card);
            };

            // 挂在外层！斩断与 Vue 重绘逻辑的牵连！
            card.appendChild(btn);
        });
    }

    // [MOD] 接收传入的源卡片 DOM
    openIframeModal(url, sourceCard) {
        const overlayId = 'west-quick-view-modal';
        if (document.getElementById(overlayId)) document.getElementById(overlayId).remove();

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.className = 'pdb-qv-overlay';

        overlay.innerHTML = window.PornUIAssets.templates.quickViewModal('正在加载原生详情页...');
        document.body.appendChild(overlay);

        const box = overlay.querySelector('.pdb-qv-modal');
        const closeBtn = overlay.querySelector('.pdb-qv-close');

        const closeModal = () => {
            overlay.remove();
            document.body.style.overflow = originalOverflow;
            // [MOD] 触发自定义事件，通知主页面小窗已关闭，并传回对应的卡片节点以便刷新
            if (sourceCard) {
                window.dispatchEvent(new CustomEvent('West_QuickView_Closed', { detail: { card: sourceCard } }));
            }
        };
        closeBtn.onclick = closeModal;
        overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

        const iframe = overlay.querySelector('.pdb-qv-iframe');
        iframe.src = url;

        iframe.onload = () => {
            try {
                const iDoc = iframe.contentDocument || iframe.contentWindow.document;

                const style = iDoc.createElement('style');
                style.innerHTML = `
                    /* 1. 隐藏无用全局组件 */
                    header, nav, footer, .sidebar, aside { display: none !important; }
                    
                    /* 2. 彻底解锁原网页大白边限制 */
                    .container, [class*="max-w-"], .mx-auto, .grid { 
                        max-width: 100% !important; 
                        width: 100% !important; 
                        padding-left: 20px !important; 
                        padding-right: 20px !important; 
                    }
                    
                    /* 3. 基础版式优化 */
                    body { padding-top: 0 !important; background: #fff !important; min-height: auto !important; }
                    .mt-24 { margin-top: 15px !important; }
                    
                    /* 4. 精准隐藏你指定的三个内容区块 */
                    .flex.flex-wrap.gap-1,
                    .w-full.bg-white.shadow-sm.rounded-sm.overflow-hidden.p-4.mb-5,
                    .n-tabs.n-tabs--card-type.n-tabs--medium-size.n-tabs--top { 
                        display: none !important; 
                    }
                `;
                iDoc.head.appendChild(style);

                box.style.opacity = '1';
            } catch (e) {
                box.style.opacity = '1';
            }
        };

        box.appendChild(closeBtn);
        box.appendChild(iframe);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }
};