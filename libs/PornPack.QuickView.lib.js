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
        if (window._qvFloatingBtnInited) return;
        window._qvFloatingBtnInited = true;

        // 1. 创建全局唯一的幽灵悬浮药丸按钮 (优化为明显圆角，视觉更现代)
        const btn = document.createElement('button');
        btn.innerHTML = '原生预览';
        btn.style.cssText = `
            position: absolute; z-index: 999999;
            padding: 5px 12px; border-radius: 20px; border: none;
            background: rgba(123, 94, 167, 0.95); color: #fff;
            font-size: 12px; font-weight: bold; cursor: pointer;
            box-shadow: 0 3px 8px rgba(0,0,0,0.4); transition: background 0.2s, transform 0.1s;
            display: none; pointer-events: auto;
        `;
        btn.onmouseover = () => { btn.style.background = 'rgba(123, 94, 167, 1)'; btn.style.transform = 'scale(1.05)'; };
        btn.onmouseout = () => { btn.style.background = 'rgba(123, 94, 167, 0.95)'; btn.style.transform = 'scale(1)'; };
        document.body.appendChild(btn);

        let currentUrl = '';
        let currentCard = null; // 性能核心锁：防止卡片内部冒泡引发 CPU 啸叫
        let hideTimeout;

        document.addEventListener('mouseover', (e) => {
            const card = e.target.closest('.w-scene-card');
            
            if (card) {
                clearTimeout(hideTimeout);
                // 只有当鼠标进入一个【新卡片】时，才触发 1 次位置计算，晃动鼠标绝不消耗性能
                if (card !== currentCard) {
                    currentCard = card;
                    const a = card.querySelector('a[href*="/scenes/"]');
                    if (a) {
                        currentUrl = a.href;
                        const rect = card.getBoundingClientRect();
                        btn.style.top = `${window.scrollY + rect.top + 12}px`;
                        btn.style.left = `${window.scrollX + rect.left + 12}px`;
                        btn.style.display = 'block';
                    }
                }
            } else if (e.target !== btn) {
                hideTimeout = setTimeout(() => { 
                    btn.style.display = 'none'; 
                    currentCard = null; 
                }, 100);
            }
        });

        btn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            btn.style.display = 'none';
            if (currentUrl) this.openIframeModal(currentUrl);
        };
    }

    openIframeModal(url) {
        const overlayId = 'west-quick-view-modal';
        if (document.getElementById(overlayId)) document.getElementById(overlayId).remove();

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.85); z-index: 9999999;
            display: flex; justify-content: center; align-items: center;
        `;

        const loading = document.createElement('div');
        loading.innerHTML = '正在加载原生详情页...';
        loading.style.cssText = 'position:absolute; color:#fff; font-size:16px; font-weight:bold; z-index:1;';
        overlay.appendChild(loading);

        const box = document.createElement('div');
        // 满屏改动：高度提升至 98vh，宽度拉满到 98%，最大宽度封顶 1800px，左右几乎完全没有空白了！
        box.style.cssText = `
            width: 98%; max-width: 1800px; height: 98vh;
            background: #fdfdfd; border-radius: 12px; overflow: hidden;
            box-shadow: 0 15px 50px rgba(0,0,0,0.7); position: relative;
            transform: translateZ(0); will-change: transform; z-index: 2; opacity: 0; transition: opacity 0.3s;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✖';
        closeBtn.style.cssText = `
            position: absolute; top: 15px; right: 25px; background: rgba(0,0,0,0.6); border: none;
            width: 38px; height: 38px; border-radius: 50%; display: flex; justify-content: center; align-items: center;
            font-size: 18px; color: #fff; cursor: pointer; z-index: 10; transition: background 0.2s; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        `;
        closeBtn.onmouseover = () => closeBtn.style.background = '#ff4d4f';
        closeBtn.onmouseout = () => closeBtn.style.background = 'rgba(0,0,0,0.6)';
        
        const closeModal = () => {
            overlay.remove();
            document.body.style.overflow = originalOverflow;
        };
        closeBtn.onclick = closeModal;
        overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.cssText = 'width: 100%; height: 100%; border: none;';

        iframe.onload = () => {
            try {
                const iDoc = iframe.contentDocument || iframe.contentWindow.document;
                
                const style = iDoc.createElement('style');
                // 🌟 魔法深度隐藏与最大宽度解锁区
                style.innerHTML = `
                    /* 1. 隐藏无用全局组件 */
                    header, nav, footer, .sidebar, aside { display: none !important; }
                    
                    /* 2. 彻底解锁原网页大白边限制，把官方最大宽度撑开到 98%，留白缩减到极致 */
                    .container, .max-w-7xl, .max-w-screen-xl, .grid { 
                        max-width: 98% !important; 
                        width: 98% !important;
                        padding-left: 15px !important; 
                        padding-right: 15px !important; 
                    }
                    
                    /* 3. 基础版式优化 */
                    body { padding-top: 0 !important; background: #fff !important; min-height: auto !important; }
                    .mt-24 { margin-top: 15px !important; }
                    
                    /* 4. 精准隐藏你指定的三个内容区块（标签、不协调大卡片、多余 tab 栏） */
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