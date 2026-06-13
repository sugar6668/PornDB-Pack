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

        // 获取所有未绑定过小窗按钮的卡片
        const cards = doc.querySelectorAll('.w-scene-card:not(.qv-bound)');
        if (!cards.length) return;

        cards.forEach(card => {
            // 打上终身标记，防止重复渲染
            card.classList.add('qv-bound');

            // 获取目标影片的链接（通常也是包裹图片的容器）
            const aNode = card.querySelector('a[href*="/scenes/"]');
            if (!aNode) return;

            // 必须把图片容器设为 relative，按钮才能乖乖待在卡片的左上角
            if (getComputedStyle(aNode).position === 'static') {
                aNode.style.position = 'relative';
            }
            aNode.style.display = 'block';

            // 创建固定显示的静态按钮
            const btn = doc.createElement('button');
            // 【完全复原样式与位置】：绝对定位，距离左侧和顶部 12px，原本的紫色背景和阴影
            btn.style.cssText = 'position: absolute; top: 12px; left: 12px; z-index: 99; padding: 5px 12px; background: #7b5ea7; color: #fff; border: none; border-radius: 4px; font-size: 13px; font-weight: bold; cursor: pointer; box-shadow: 0 3px 8px rgba(0,0,0,0.4);';
            btn.innerHTML = '原生预览';

            // 只有点击这一瞬间，才会唤醒小窗功能
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openIframeModal(aNode.href);
            };

            // 将按钮原汁原味地挂载到图片链接的内部
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