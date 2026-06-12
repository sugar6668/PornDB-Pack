/**
 * @name         PornPack Bookmark Library
 * @description  PornDB 时间轴导出为 PotPlayer 书签核心模块
 * @version      1.0.0
 */

window.PornBookmark = class PornBookmark {
    static BTN_ID = 'export-pbf-btn';

    static init() {
        this.ensureButtonExists();
    }

    static ensureButtonExists() {
        if (!location.href.includes('/scenes/')) return;
        const targetAnchor = document.getElementById('btn-copy-kw');

        if (targetAnchor && !document.getElementById(this.BTN_ID)) {
            this.createExportButton(targetAnchor);
        }
    }

    static getStandardizedFilename() {
        try {
            if (window.PornParser) {
                const details = window.PornParser.parseWestDetails(document);
                if (details && details.isValid) {
                    let cleanRawTitle = details.titlePart || details.title || "";
                    let maker = details.maker ? details.maker.trim() : "";

                    if (maker && cleanRawTitle.toLowerCase().startsWith(maker.toLowerCase())) {
                        cleanRawTitle = cleanRawTitle.substring(maker.length).replace(/^[^a-zA-Z0-9\u4e00-\u9fa5]+/, '').trim();
                    }

                    let cleanNewName = details.matchPrefix
                        ? `${details.matchPrefix} ${cleanRawTitle}`
                        : (details.fullTitle || cleanRawTitle);

                    return cleanNewName.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || "视频时间轴书签";
                }
            }
            return document.title.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, ' ').trim();
        } catch (e) {
            return "视频时间轴书签";
        }
    }

    static createExportButton(targetAnchor) {
        const btn = document.createElement('button');
        btn.id = this.BTN_ID;
        btn.className = 'west-engine-btn';
        btn.innerHTML = '导出书签';

        btn.style.cssText = `
            background: #e6a23c;
            border-color: #e6a23c;
            color: #fff;
            margin-left: 4px;
        `;

        btn.onmouseover = () => btn.style.backgroundColor = '#ebb563';
        btn.onmouseout = () => btn.style.backgroundColor = '#e6a23c';

        btn.addEventListener('click', () => this.handleExport());
        targetAnchor.insertAdjacentElement('afterend', btn);
    }

    static async handleExport() {
        let pbfContent = "[Bookmark]\r\n";
        let validBookmarksCount = 0;

        const timelineContainer = document.querySelector('div.flex.flex-wrap.gap-y-5.gap-x-2');
        if (!timelineContainer) return alert("未检测到时间轴数据！");

        const items = timelineContainer.querySelectorAll('div.text-sm.rounded-sm');
        if (items.length === 0) return alert("未在容器内找到时间轴节点！");

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
            const finalName = this.getStandardizedFilename();
            const fileName = `${finalName}.pbf`;
            const btn = document.getElementById(this.BTN_ID);
            const originalText = btn.innerHTML;

            // 1. 尝试获取页面上的 115 目录 CID
            const matchedBtn = document.querySelector('.x-match-btn-wide');
            const targetCid = matchedBtn ? matchedBtn.dataset.cid : null;

            // 2. 暴力穿透沙盒获取 Req115 类
            const ReqClass = typeof Req115 !== 'undefined' ? Req115 : (typeof window.Req115 !== 'undefined' ? window.Req115 : null);

            // 如果有匹配结果且加载了 115 通信类
            if (targetCid && ReqClass) {
                btn.innerHTML = '正在同步115...';
                try {
                    // 使用标准的 File 对象
                    const fileObj = this.createPbfFile(pbfContent, fileName);

                    // 获取上传凭证
                    const initRes = await ReqClass.sampleInitUpload({ filename: fileName, filesize: fileObj.size, cid: targetCid });

                    if (initRes && initRes.host) {
                        // 执行直传
                        await ReqClass.upload({ ...initRes, filename: fileName, file: fileObj });
                        btn.innerHTML = `已同步115 (${validBookmarksCount})`;
                    } else {
                        throw new Error(initRes?.error_msg || "获取115上传凭证失败，可能是接口变动");
                    }
                } catch (e) {
                    console.error("[PornBookmark] 115同步异常日志:", e);
                    alert("115书签同步失败，将自动降级为下载到本地！\n报错详情: " + e.message);
                    this.downloadFile(pbfContent, fileName);
                    btn.innerHTML = `已降级本地 (${validBookmarksCount})`;
                }
            } else {
                // 如果页面还没查出 115 结果，或者缺少 Req115
                if (!targetCid) console.log("[PornBookmark] 未找到匹配的 115 目录 CID，直接走本地导出。");
                this.downloadFile(pbfContent, fileName);
                btn.innerHTML = `已导出本地 (${validBookmarksCount})`;
            }

            btn.style.backgroundColor = '#67c23a';
            btn.style.borderColor = '#67c23a';

            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.backgroundColor = '#e6a23c';
                btn.style.borderColor = '#e6a23c';
            }, 3000);

        } else {
            alert("未能提取到有效的时间标签！");
        }
    }

    // 生成标准的 File 对象 (解决 115 严格的上传校验)
    static createPbfFile(content, filename) {
        const buffer = new ArrayBuffer(content.length * 2);
        const view = new Uint16Array(buffer);
        for (let i = 0; i < content.length; i++) {
            view[i] = content.charCodeAt(i);
        }
        const bom = new Uint8Array([0xFF, 0xFE]);
        const blob = new Blob([bom, buffer], { type: 'application/octet-stream' });
        // [MOD] 强制转换为标准的 File 对象，而非单纯的 Blob
        return new File([blob], filename, { type: 'application/octet-stream' });
    }

    // 本地下载功能复用 File 生成
    static downloadFile(content, filename) {
        const fileObj = this.createPbfFile(content, filename);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(fileObj);
        link.download = filename;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();

        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }
};