/**
 * @name         PornPack Media Gallery Library
 * @description  横向超清画廊与原生预告片播放器模块
 * @version      1.0.0
 */

window.PornMediaGallery = class PornMediaGallery {
    constructor(options) {
        this.gmFetch = options.gmFetch;
        this.injectStyles();
    }

    injectStyles() {
        if (document.getElementById('west-media-gallery-style')) return;
        const style = document.createElement('style');
        style.id = 'west-media-gallery-style';
        // 无背景的纯净容器，横向滚动，定制优雅的滚动条
        style.innerHTML = `
            .west-media-gallery { display: flex; overflow-x: auto; gap: 12px; padding: 10px 2px; margin-top: 15px; scroll-behavior: smooth; }
            .west-media-gallery::-webkit-scrollbar { height: 6px; }
            .west-media-gallery::-webkit-scrollbar-thumb { background: #dcdfe6; border-radius: 3px; }
            .west-media-gallery::-webkit-scrollbar-thumb:hover { background: #c0c4cc; }
            .west-media-item { position: relative; flex-shrink: 0; height: 160px; cursor: pointer; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.15); transition: transform 0.2s, box-shadow 0.2s; background: #000; }
            .west-media-item:hover { transform: translateY(-3px); box-shadow: 0 6px 12px rgba(0,0,0,0.25); z-index: 2; }
            .west-media-item img { height: 100%; width: auto; min-width: 120px; display: block; object-fit: cover; opacity: 0.9; transition: opacity 0.2s; }
            .west-media-item:hover img { opacity: 1; }
            .west-media-play-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.3); display: flex; justify-content: center; align-items: center; transition: background 0.2s; }
            .west-media-item:hover .west-media-play-overlay { background: rgba(0,0,0,0.1); }
            .west-media-play-btn { width: 44px; height: 44px; background: rgba(123, 94, 167, 0.9); border-radius: 50%; display: flex; justify-content: center; align-items: center; box-shadow: 0 0 10px rgba(0,0,0,0.5); }
            .west-media-play-btn svg { width: 22px; height: 22px; fill: #fff; margin-left: 3px; }
            .west-media-tag { position: absolute; top: 6px; left: 6px; background: rgba(0,0,0,0.6); color: #fff; font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: bold; pointer-events: none; }
        `;
        document.head.appendChild(style);
    }

    async render(container, details) {
        if (!container || !details.url) return;

        // 1. 提取 UUID
        const uuidMatch = details.url.match(/scenes\/([a-z0-9\-]+)/i);
        if (!uuidMatch) return;
        const uuid = uuidMatch[1];

        // 显示加载骨架屏
        container.innerHTML = `<div style="color: #909399; font-size: 13px; padding: 10px 0;">✨ 正在拉取官方原生超清画廊...</div>`;

        try {
            // 2. 静默调用官方 API
            const res = await this.gmFetch(`https://api.theporndb.net/scenes/${uuid}`);
            if (!res.loadstuts) throw new Error('网络请求失败');
            
            const j = JSON.parse(res.responseText);
            const data = j.data;
            if (!data) throw new Error('未获取到有效数据');

            // 3. 提取预告片和超清图
            const trailer = data.trailer || '';
            const images = [];
            
            // 收集所有最高清的图片，过滤重复项
            const addImg = (url) => { if (url && !images.includes(url)) images.push(url); };
            if (data.background && data.background.full) addImg(data.background.full);
            if (data.posters && data.posters.full) addImg(data.posters.full);
            if (Array.isArray(data.gallery)) {
                data.gallery.forEach(g => addImg(g.full || g.url));
            }

            if (!trailer && images.length === 0) {
                container.innerHTML = ''; // 什么都没有，直接隐藏该区域
                return;
            }

            // 4. 构建横向滑动 DOM
            container.innerHTML = '';
            const galleryDiv = document.createElement('div');
            galleryDiv.className = 'west-media-gallery';

            // 插入预告片卡片 (如果存在)
            if (trailer) {
                const cover = images[0] || details.coverUrl; // 随便拿一张当视频底图
                const videoCard = document.createElement('div');
                videoCard.className = 'west-media-item';
                videoCard.innerHTML = `
                    <img src="${cover}" onerror="this.src=''">
                    <div class="west-media-play-overlay">
                        <div class="west-media-play-btn">
                            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                    </div>
                    <div class="west-media-tag">🎬 预告片</div>
                `;
                videoCard.onclick = () => this.openLightbox('video', trailer);
                galleryDiv.appendChild(videoCard);
            }

            // 插入所有高清图片
            images.forEach((imgUrl, index) => {
                const imgCard = document.createElement('div');
                imgCard.className = 'west-media-item';
                imgCard.innerHTML = `
                    <img src="${imgUrl}">
                    <div class="west-media-tag">📸 剧照 ${index + 1}</div>
                `;
                imgCard.onclick = () => this.openLightbox('image', imgUrl);
                galleryDiv.appendChild(imgCard);
            });

            container.appendChild(galleryDiv);

        } catch (e) {
            console.error('[PornMediaGallery] 抓取失败:', e);
            container.innerHTML = ''; // 出错则静默隐藏
        }
    }

    // 5. 顶层全局 Lightbox (弹窗播放/看图器)
    openLightbox(type, src) {
        const overlayId = 'west-media-lightbox';
        if (document.getElementById(overlayId)) document.getElementById(overlayId).remove();

        const overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.9); z-index: 99999999;
            display: flex; justify-content: center; align-items: center;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✖';
        closeBtn.style.cssText = `
            position: absolute; top: 20px; right: 25px; background: rgba(255,255,255,0.1); border: none;
            width: 40px; height: 40px; border-radius: 50%; display: flex; justify-content: center; align-items: center;
            font-size: 20px; color: #fff; cursor: pointer; z-index: 10; transition: background 0.2s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.background = '#ff4d4f';
        closeBtn.onmouseout = () => closeBtn.style.background = 'rgba(255,255,255,0.1)';
        closeBtn.onclick = () => overlay.remove();

        overlay.appendChild(closeBtn);

        if (type === 'video') {
            const video = document.createElement('video');
            video.src = src;
            video.controls = true;
            video.autoplay = true;
            video.style.cssText = 'max-width: 90vw; max-height: 90vh; outline: none; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);';
            overlay.appendChild(video);
        } else if (type === 'image') {
            const img = document.createElement('img');
            img.src = src;
            img.style.cssText = 'max-width: 95vw; max-height: 95vh; object-fit: contain; border-radius: 4px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);';
            overlay.appendChild(img);
        }

        // 点击背景区域也可以关闭
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        document.body.appendChild(overlay);
    }
};