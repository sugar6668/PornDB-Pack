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

        // [MOD] 彻底删除 JS 事件模拟的 hover，全权交由 CSS 的 class 切换处理
        if (state === 'cloud_exists') {
            mainBtn.innerHTML = '网盘已有';
            mainBtn.className = 'west-engine-btn pdb-bm-btn pdb-bm-main-btn pdb-bm-state-cloud';
            mainBtn.onclick = () => this.handleExport('cloud', mainBtn);

            dropBtn.className = 'west-engine-btn pdb-bm-btn pdb-bm-drop-btn pdb-bm-state-cloud';
            dropOption.innerHTML = '导出书签';
            dropOption.onclick = () => {
                document.getElementById('pbf-dropdown-menu').style.display = 'none';
                this.handleExport('local', mainBtn);
            };
        } else {
            mainBtn.innerHTML = '导出书签';
            mainBtn.className = 'west-engine-btn pdb-bm-btn pdb-bm-main-btn pdb-bm-state-local';
            mainBtn.onclick = () => this.handleExport('local', mainBtn);

            dropBtn.className = 'west-engine-btn pdb-bm-btn pdb-bm-drop-btn pdb-bm-state-local';
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
        // [MOD] 删除长串的 style.cssText
        const wrapper = document.createElement('div');
        wrapper.className = 'pdb-bm-wrapper';

        const mainBtn = document.createElement('button');
        mainBtn.id = this.BTN_ID;

        const dropBtn = document.createElement('button');
        dropBtn.innerHTML = window.PornUIAssets.icons.dropArrow;

        const menu = document.createElement('div');
        menu.id = 'pbf-dropdown-menu';
        menu.className = 'pdb-bm-menu';

        const uploadOption = document.createElement('div');
        uploadOption.id = 'pbf-drop-option';
        uploadOption.className = 'pdb-bm-option';

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

        this.hasPbfInCloud = false;
        this.updateButtonUI('default');
    }

    // [ADD] 灵活的临时状态文字提示方法
    static setTempBtnState(btn, fallbackText, newText, tempColor) {
        // 临时状态（比如3秒钟的绿色成功提示）依然允许使用内联样式最高优先级覆盖
        btn.innerHTML = newText;
        btn.style.backgroundColor = tempColor;
        btn.style.borderColor = tempColor;
        setTimeout(() => {
            // [MOD] 3秒后清空内联样式，自动恢复为当前 class 应该有的颜色
            btn.style.backgroundColor = '';
            btn.style.borderColor = '';
            btn.innerHTML = this.hasPbfInCloud ? '网盘已有' : fallbackText;
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

                        // [MOD] 增加极速秒传校验，并校验 OSS 真实回调 JSON 结果
                        if (initRes && (initRes.host || initRes.status === 2 || initRes.statuscode === 0)) {
                            if (initRes.host) {
                                // [MOD] 书签专用的重试机制：精准使用 fileName 变量
                                let uploadRes = null;
                                for (let retry = 0; retry < 3; retry++) {
                                    uploadRes = await ReqClass.upload({ ...initRes, filename: fileName, file: fileObj });
                                    if (uploadRes && uploadRes.state !== false) break;
                                    await new Promise(r => setTimeout(r, 1500));
                                }
                                if (uploadRes && uploadRes.state === false) throw new Error(uploadRes.error_msg || uploadRes.error || "115 服务器拒绝接收回调");
                            }
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