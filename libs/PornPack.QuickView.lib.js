/**
 * @name         PornPack Quick View Library
 * @description  原生 Iframe 级小窗预览
 * @version      1.0.0
 */

window.PornQuickView = class PornQuickView {
    constructor(options) {
        // 由于使用 Iframe 原生加载，底层的 doAutoMatch 和 magnetUI 会由主脚本在 Iframe 内自动实例化并执行
        // 这里保留 constructor 只是为了兼容主脚本的调用格式，不报错
    }

    ensureButtons(doc) {
        // 【核心安全锁】：如果当前已经是在 Iframe 小窗里了，就不再生成按钮（禁止套娃）
        if (window.self !== window.top) return;

        // 确保全局只初始化一次悬浮按钮，绝不重复绑定
        if (window._qvFloatingBtnInited) return;
        window._qvFloatingBtnInited = true;

        // 1. 创建全局唯一的高性能幽灵悬浮按钮 (直接挂载在 body 上，Vue 无法干涉)
        const btn = document.createElement('button');
        btn.innerHTML = '预览';
        btn.style.cssText = `
            position: absolute; z-index: 999999;
            padding: 4px 10px; border-radius: 4px; border: none;
            background: rgba(123, 94, 167, 0.95); color: #fff;
            font-size: 12px; font-weight: bold; cursor: pointer;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4); transition: background 0.2s;
            display: none; pointer-events: auto;
        `;
        btn.onmouseover = () => btn.style.background = 'rgba(123, 94, 167, 1)';
        btn.onmouseout = () => btn.style.background = 'rgba(123, 94, 167, 0.95)';
        document.body.appendChild(btn);

        let currentUrl = '';
        let hideTimeout;

        // 2. 鼠标追踪系统（性能消耗极低）：鼠标移到哪，按钮跟到哪
        document.addEventListener('mouseover', (e) => {
            const card = e.target.closest('.w-scene-card');
            if (card) {
                clearTimeout(hideTimeout);
                const a = card.querySelector('a[href*="/scenes/"]');
                if (a) {
                    currentUrl = a.href;
                    const rect = card.getBoundingClientRect();
                    // 将按钮精准定位到当前鼠标悬浮的卡片左上角
                    btn.style.top = `${window.scrollY + rect.top + 6}px`;
                    btn.style.left = `${window.scrollX + rect.left + 6}px`;
                    btn.style.display = 'block';
                }
            } else if (e.target !== btn) {
                // 离开卡片且没碰到按钮时，稍微延迟后隐藏按钮
                hideTimeout = setTimeout(() => { btn.style.display = 'none'; }, 100);
            }
        });

        // 3. 点击按钮，唤出原生 Iframe 小窗
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            btn.style.display = 'none';
            if (currentUrl) this.openIframeModal(currentUrl);
        };
    }

    openIframeModal(url) {
        const overlayId = 'west-quick-view-modal';
        if (document.getElementById(overlayId)) document.getElementById(overlayId).remove();

        // 锁定背景网页的滚动
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // 建立全屏黑灰色遮罩
        const overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.85); z-index: 9999999;
            display: flex; justify-content: center; align-items: center;
        `;

        // 加载提示文字
        const loading = document.createElement('div');
        loading.innerHTML = '正在加载原生详情页...';
        loading.style.cssText = 'position:absolute; color:#fff; font-size:16px; font-weight:bold; z-index:1;';
        overlay.appendChild(loading);

        // 创建 Iframe 容器白板
        const box = document.createElement('div');
        box.style.cssText = `
            width: 95%; max-width: 1200px; height: 90vh;
            background: #fdfdfd; border-radius: 12px; overflow: hidden;
            box-shadow: 0 10px 40px rgba(0,0,0,0.6); position: relative;
            transform: translateZ(0); z-index: 2; opacity: 0; transition: opacity 0.3s;
        `;

        // 弹窗关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✖';
        closeBtn.style.cssText = `
            position: absolute; top: 15px; right: 25px; background: rgba(0,0,0,0.5); border: none;
            width: 36px; height: 36px; border-radius: 50%; display: flex; justify-content: center; align-items: center;
            font-size: 18px; color: #fff; cursor: pointer; z-index: 10; transition: background 0.2s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.background = '#ff4d4f';
        closeBtn.onmouseout = () => closeBtn.style.background = 'rgba(0,0,0,0.5)';
        
        const closeModal = () => {
            overlay.remove();
            document.body.style.overflow = originalOverflow;
        };
        closeBtn.onclick = closeModal;
        overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

        // 核心武器：嵌套真实的详情页 Iframe
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.cssText = 'width: 100%; height: 100%; border: none;';

        // Iframe 页面加载完毕后的“魔法隐藏”操作
        iframe.onload = () => {
            try {
                // 获取 Iframe 内部的 DOM 文档
                const iDoc = iframe.contentDocument || iframe.contentWindow.document;
                
                // 注入一段 CSS：隐藏掉无用的顶部导航栏、底部版权，把主要内容顶上去
                const style = iDoc.createElement('style');
                style.innerHTML = `
                    header, nav, footer, .sidebar, aside { display: none !important; }
                    body { padding-top: 0 !important; background: #fff !important; min-height: auto !important; }
                    .mt-24 { margin-top: 20px !important; } /* 消除原有的顶部留白 */
                `;
                iDoc.head.appendChild(style);
                
                // 页面改造完毕，瞬间显示给用户（视觉上就像弹出了一个小窗，其实是一个完整的网页）
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