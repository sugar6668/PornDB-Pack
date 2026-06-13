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

        // [ADD] 1. 一次性注入纯 CSS 驱动的悬浮动画（0% CPU开销，GPU硬件加速）
        if (!doc.getElementById('qv-static-style')) {
            const style = doc.createElement('style');
            style.id = 'qv-static-style';
            style.innerHTML = `
                /* 按钮默认隐身且不响应鼠标，防止遮挡底层链接 */
                .qv-static-btn {
                    position: absolute; top: 8px; left: 8px; z-index: 99;
                    padding: 5px 12px; border-radius: 4px; border: none;
                    background: rgba(123, 94, 167, 0.95); color: #fff;
                    font-size: 12px; font-weight: bold; cursor: pointer;
                    box-shadow: 0 3px 8px rgba(0,0,0,0.4); 
                    transition: opacity 0.2s, transform 0.1s;
                    opacity: 0; pointer-events: none;
                }
                /* 卡片悬停时，按钮显形并可点击 */
                .w-scene-card:hover .qv-static-btn {
                    opacity: 1; pointer-events: auto;
                }
                /* 按钮自身的交互动画 */
                .qv-static-btn:hover {
                    background: rgba(123, 94, 167, 1); transform: scale(1.05);
                }
            `;
            doc.head.appendChild(style);
        }

        // 2. 静态批量绑定（剔除已经绑过的卡片）
        const cards = doc.querySelectorAll('.w-scene-card:not(.qv-bound)');
        if (!cards.length) return;

        cards.forEach(card => {
            card.classList.add('qv-bound');

            // 找到卡片里的主封面链接
            const aNode = card.querySelector('a[href*="/scenes/"]');
            if (!aNode) return;

            // 确保封面的定位模式支持 absolute 子元素
            if (getComputedStyle(aNode).position === 'static') {
                aNode.style.position = 'relative';
            }
            aNode.style.display = 'block';

            // 直接把固定按钮塞进链接里
            const btn = doc.createElement('button');
            btn.className = 'qv-static-btn';
            btn.innerHTML = '原生预览';

            // 拦截点击事件，防止误触底层的 a 标签跳转
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openIframeModal(aNode.href);
            };

            aNode.appendChild(btn);
        });
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
        box.style.cssText = `
            width: 88%; max-width: 1300px; height: 88vh;
            background: #fdfdfd; border-radius: 12px; overflow: hidden;
            box-shadow: 0 15px 50px rgba(0,0,0,0.7); position: relative;
            transform: translateZ(0); will-change: transform; z-index: 2; opacity: 0; transition: opacity 0.3s;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
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