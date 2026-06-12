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
        // [MOD] 容器：使用 relative 定位包裹主按钮、下拉箭头和菜单
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position: relative; display: inline-flex; align-items: center; margin-left: 4px;';

        // 主按钮：导出本地
        const mainBtn = document.createElement('button');
        mainBtn.id = this.BTN_ID;
        mainBtn.className = 'west-engine-btn';
        mainBtn.innerHTML = '导出书签';
        mainBtn.style.cssText = `background: #e6a23c; border-color: #e6a23c; color: #fff; border-top-right-radius: 0; border-bottom-right-radius: 0; border-right: 1px solid #f3d19e;`;
        mainBtn.onmouseover = () => mainBtn.style.backgroundColor = '#ebb563';
        mainBtn.onmouseout = () => mainBtn.style.backgroundColor = '#e6a23c';

        // 下拉箭头按钮
        const dropBtn = document.createElement('button');
        dropBtn.className = 'west-engine-btn';
        dropBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
        dropBtn.style.cssText = `background: #e6a23c; border-color: #e6a23c; color: #fff; border-top-left-radius: 0; border-bottom-left-radius: 0; padding: 6px; display: flex; align-items: center; justify-content: center;`;
        dropBtn.onmouseover = () => dropBtn.style.backgroundColor = '#ebb563';
        dropBtn.onmouseout = () => dropBtn.style.backgroundColor = '#e6a23c';

        // 浮动菜单
        const menu = document.createElement('div');
        menu.style.cssText = `display: none; position: absolute; top: 100%; right: 0; margin-top: 4px; background: #fff; border: 1px solid #e4e7ed; border-radius: 4px; box-shadow: 0 2px 12px 0 rgba(0,0,0,.1); z-index: 9999; min-width: 90px; overflow: hidden;`;

        const uploadOption = document.createElement('div');
        uploadOption.innerHTML = '上传书签';
        uploadOption.style.cssText = `padding: 8px 15px; font-size: 13px; font-weight: 600; color: #606266; cursor: pointer; text-align: center; transition: background 0.2s;`;
        uploadOption.onmouseover = () => uploadOption.style.backgroundColor = '#f5f7fa';
        uploadOption.onmouseout = () => uploadOption.style.backgroundColor = '#fff';

        menu.appendChild(uploadOption);
        wrapper.appendChild(mainBtn);
        wrapper.appendChild(dropBtn);
        wrapper.appendChild(menu);
        targetAnchor.insertAdjacentElement('afterend', wrapper);

        // 事件绑定
        dropBtn.onclick = (e) => {
            e.stopPropagation();
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        };
        document.addEventListener('click', () => menu.style.display = 'none');

        // 传递 mode 参数以区分功能
        mainBtn.onclick = () => this.handleExport('local', mainBtn);
        uploadOption.onclick = () => {
            menu.style.display = 'none';
            this.handleExport('cloud', mainBtn);
        };
    }

    // [ADD] 辅助方法：统一处理按钮状态的恢复
    static setTempBtnState(btn, originalText, newText, color) {
        btn.innerHTML = newText;
        btn.style.backgroundColor = color;
        btn.style.borderColor = color;
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.backgroundColor = '#e6a23c';
            btn.style.borderColor = '#e6a23c';
        }, 3000);
    }

    static async handleExport(mode = 'local', btnNode) { // [MOD] 新增参数区分模式和按钮实例
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
            const originalText = btnNode.innerHTML;

            if (mode === 'local') {
                // 分支 1：仅下载到本地
                this.downloadFile(pbfContent, fileName);
                this.setTempBtnState(btnNode, originalText, `已导出本地 (${validBookmarksCount})`, '#67c23a');
            } else if (mode === 'cloud') {
                // 分支 2：仅上传到网盘
                const matchedBtn = document.querySelector('.x-match-btn-wide');
                const targetCid = matchedBtn ? matchedBtn.dataset.cid : null;
                const ReqClass = typeof Req115 !== 'undefined' ? Req115 : (typeof window.Req115 !== 'undefined' ? window.Req115 : null);

                if (targetCid && ReqClass) {
                    btnNode.innerHTML = '正在上传...';
                    try {
                        const fileObj = this.createPbfFile(pbfContent, fileName);
                        const initRes = await ReqClass.sampleInitUpload({ filename: fileName, filesize: fileObj.size, cid: targetCid });

                        if (initRes && initRes.host) {
                            await ReqClass.upload({ ...initRes, filename: fileName, file: fileObj });
                            this.setTempBtnState(btnNode, originalText, `上传成功 (${validBookmarksCount})`, '#67c23a');
                        } else {
                            throw new Error(initRes?.error_msg || "获取115上传凭证失败");
                        }
                    } catch (e) {
                        console.error("[PornBookmark] 上传115失败:", e);
                        alert("书签上传网盘失败: " + e.message);
                        this.setTempBtnState(btnNode, originalText, `上传失败`, '#f56c6c'); // 红色警示
                    }
                } else {
                    alert("无法上传：请先等待界面匹配出 115 影片归档目录！");
                    this.setTempBtnState(btnNode, originalText, `无目标目录`, '#e6a23c');
                }
            }
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