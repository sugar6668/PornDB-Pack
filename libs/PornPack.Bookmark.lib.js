/**
 * @name         PornPack Bookmark Library
 * @description  PornDB 时间轴导出为 PotPlayer 书签核心模块
 * @version      1.0.0
 */

window.PornBookmark = class PornBookmark {
    static BTN_ID = 'export-pbf-btn';
    static checkedCid = null; // [ADD] 记录当前检查过的目录
    static hasPbfInCloud = false; // [ADD] 记录网盘中是否存在书签

    static init() {
        this.ensureButtonExists();
    }

    static ensureButtonExists() {
        if (!location.href.includes('/scenes/')) return;
        const targetAnchor = document.getElementById('btn-copy-kw');

        if (targetAnchor && !document.getElementById(this.BTN_ID)) {
            this.createExportButton(targetAnchor);
            this.checkedCid = null; // 重置检查状态
        }

        // [ADD] 动态检测 115 匹配状态，一旦目录出现立即查询书签文件
        const matchedBtn = document.querySelector('.x-match-btn-wide');
        const currentCid = matchedBtn ? matchedBtn.dataset.cid : null;
        if (currentCid && currentCid !== this.checkedCid) {
            this.checkedCid = currentCid;
            this.checkPbfInCloud(currentCid);
        }
    }

    // [ADD] 查询 115 目录并更新界面状态
    static async checkPbfInCloud(cid) {
        const ReqClass = typeof Req115 !== 'undefined' ? Req115 : (typeof window.Req115 !== 'undefined' ? window.Req115 : null);
        if (!ReqClass) return;
        try {
            const res = await ReqClass.filesAll(cid);
            const hasPbf = res?.data?.some(f => f.n.toLowerCase().endsWith('.pbf'));
            this.hasPbfInCloud = !!hasPbf;
            this.updateButtonUI(this.hasPbfInCloud ? 'cloud_exists' : 'default');
        } catch (e) { }
    }

    // [ADD] 根据网盘状态切换主副按钮
    static updateButtonUI(state) {
        const mainBtn = document.getElementById(this.BTN_ID);
        const dropOption = document.getElementById('pbf-drop-option');
        const dropBtn = mainBtn ? mainBtn.nextElementSibling : null;
        if (!mainBtn || !dropOption || !dropBtn) return;

        if (state === 'cloud_exists') {
            const color = '#67c23a'; const hoverColor = '#85ce61';
            const fontColor = '#ffffff'; // [ADD] 在此定义网盘已有状态的字体颜色

            mainBtn.innerHTML = '网盘已有';
            mainBtn.style.backgroundColor = color; mainBtn.style.borderColor = color;
            mainBtn.style.color = fontColor; // [ADD] 赋值字体颜色
            mainBtn.onmouseover = () => mainBtn.style.backgroundColor = hoverColor;
            mainBtn.onmouseout = () => mainBtn.style.backgroundColor = color;
            mainBtn.onclick = () => this.handleExport('cloud', mainBtn);

            dropBtn.style.backgroundColor = color; dropBtn.style.borderColor = color;
            dropBtn.style.color = fontColor; // [ADD] 箭头颜色同步
            dropBtn.onmouseover = () => dropBtn.style.backgroundColor = hoverColor;
            dropBtn.onmouseout = () => dropBtn.style.backgroundColor = color;

            dropOption.innerHTML = '导出书签';
            dropOption.onclick = () => {
                document.getElementById('pbf-dropdown-menu').style.display = 'none';
                this.handleExport('local', mainBtn);
            };
        } else {
            const color = '#e6a23c'; const hoverColor = '#ebb563';
            const fontColor = '#ffffff'; // [ADD] 在此定义默认状态的字体颜色

            mainBtn.innerHTML = '导出书签';
            mainBtn.style.backgroundColor = color; mainBtn.style.borderColor = color;
            mainBtn.style.color = fontColor; // [ADD] 赋值字体颜色
            mainBtn.onmouseover = () => mainBtn.style.backgroundColor = hoverColor;
            mainBtn.onmouseout = () => mainBtn.style.backgroundColor = color;
            mainBtn.onclick = () => this.handleExport('local', mainBtn);

            dropBtn.style.backgroundColor = color; dropBtn.style.borderColor = color;
            dropBtn.style.color = fontColor; // [ADD] 箭头颜色同步
            dropBtn.onmouseover = () => dropBtn.style.backgroundColor = hoverColor;
            dropBtn.onmouseout = () => dropBtn.style.backgroundColor = color;

            dropOption.innerHTML = '上传书签';
            dropOption.onclick = () => {
                document.getElementById('pbf-dropdown-menu').style.display = 'none';
                this.handleExport('cloud', mainBtn);
            };
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

                    // [MOD] 修复过度裁剪问题：如果无法构建前缀，则使用原始 details.titlePart 作为兜底以保留原汁原味
                    let cleanNewName = details.matchPrefix
                        ? `${details.matchPrefix} ${cleanRawTitle}`
                        : (details.fullTitle || details.titlePart || cleanRawTitle);

                    return cleanNewName.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || "视频时间轴书签";
                }
            }
            return document.title.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, ' ').trim();
        } catch (e) {
            return "视频时间轴书签";
        }
    }

    static createExportButton(targetAnchor) {
        const wrapper = document.createElement('div');
        // [MOD] 核心修复：使用 align-items: stretch 强制拉伸子元素高度完全一致
        wrapper.style.cssText = 'position: relative; display: inline-flex; align-items: stretch; margin-left: 4px; vertical-align: top;';

        const mainBtn = document.createElement('button');
        mainBtn.id = this.BTN_ID;
        mainBtn.className = 'west-engine-btn';
        mainBtn.style.cssText = `border-top-right-radius: 0; border-bottom-right-radius: 0; border-right: 1px solid rgba(255,255,255,0.3); transition: all 0.2s;`;

        const dropBtn = document.createElement('button');
        dropBtn.className = 'west-engine-btn';
        dropBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
        dropBtn.style.cssText = `border-top-left-radius: 0; border-bottom-left-radius: 0; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s;`;

        const menu = document.createElement('div');
        menu.id = 'pbf-dropdown-menu';
        menu.style.cssText = `display: none; position: absolute; top: 100%; right: 0; margin-top: 4px; background: #fff; border: 1px solid #e4e7ed; border-radius: 4px; box-shadow: 0 2px 12px 0 rgba(0,0,0,.1); z-index: 9999; min-width: 90px; overflow: hidden;`;

        const uploadOption = document.createElement('div');
        uploadOption.id = 'pbf-drop-option';
        uploadOption.style.cssText = `padding: 8px 15px; font-size: 13px; font-weight: 600; color: #606266; cursor: pointer; text-align: center; transition: background 0.2s;`;
        uploadOption.onmouseover = () => uploadOption.style.backgroundColor = '#f5f7fa';
        uploadOption.onmouseout = () => uploadOption.style.backgroundColor = '#fff';

        menu.appendChild(uploadOption);
        wrapper.appendChild(mainBtn);
        wrapper.appendChild(dropBtn);
        wrapper.appendChild(menu);
        targetAnchor.insertAdjacentElement('afterend', wrapper);

        dropBtn.onclick = (e) => {
            e.stopPropagation();
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        };
        document.addEventListener('click', () => menu.style.display = 'none');

        // 初始化绑定事件与状态
        this.hasPbfInCloud = false;
        this.updateButtonUI('default');
    }

    // [ADD] 灵活的临时状态文字提示方法
    static setTempBtnState(btn, fallbackText, newText, tempColor) {
        const baseColor = this.hasPbfInCloud ? '#67c23a' : '#e6a23c';
        btn.innerHTML = newText;
        btn.style.backgroundColor = tempColor;
        btn.style.borderColor = tempColor;
        setTimeout(() => {
            btn.innerHTML = this.hasPbfInCloud ? '网盘已有' : fallbackText;
            btn.style.backgroundColor = this.hasPbfInCloud ? '#67c23a' : '#e6a23c';
            btn.style.borderColor = this.hasPbfInCloud ? '#67c23a' : '#e6a23c';
        }, 3000);
    }

    static async handleExport(mode = 'local', btnNode) {
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

            if (mode === 'local') {
                this.downloadFile(pbfContent, fileName);
                this.setTempBtnState(btnNode, '导出书签', `已导出本地 (${validBookmarksCount})`, '#67c23a');
            } else if (mode === 'cloud') {
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
                            // [MOD] 成功后刷新UI变为“网盘已有”模式
                            this.hasPbfInCloud = true;
                            this.updateButtonUI('cloud_exists');
                            this.setTempBtnState(btnNode, '导出书签', `上传成功 (${validBookmarksCount})`, '#67c23a');
                        } else {
                            throw new Error(initRes?.error_msg || "获取115上传凭证失败");
                        }
                    } catch (e) {
                        console.error("[PornBookmark] 上传115失败:", e);
                        alert("书签上传网盘失败: " + e.message);
                        this.setTempBtnState(btnNode, '导出书签', `上传失败`, '#f56c6c');
                    }
                } else {
                    alert("无法上传：请先等待界面匹配出 115 影片归档目录！");
                    this.setTempBtnState(btnNode, '导出书签', `无目标目录`, '#e6a23c');
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