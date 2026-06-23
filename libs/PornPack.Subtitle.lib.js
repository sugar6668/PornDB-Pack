/**
 * @name         PornPack Subtitle Library
 * @description  基于迅雷接口的字幕检索与 115 云端直传模块
 * @version      1.0.0
 */

window.PornSubtitle = class PornSubtitle {
    static BTN_ID = 'search-subtitle-btn';
    static checkedCid = null;
    static hasSubInCloud = false;

    static ensureButtonExists() {
        if (!location.href.includes('/scenes/')) return;
        const pbfBtn = document.getElementById('export-pbf-btn');
        const targetAnchor = pbfBtn ? pbfBtn.parentElement : document.getElementById('btn-copy-kw');

        if (targetAnchor && !document.getElementById(this.BTN_ID)) {
            this.createSearchButton(targetAnchor);
            this.checkedCid = null;
        }

        const matchedBtn = document.querySelector('.x-match-btn-wide');
        const currentCid = matchedBtn ? matchedBtn.dataset.cid : null;
        if (currentCid && currentCid !== this.checkedCid) {
            this.checkedCid = currentCid;
            this.checkSubInCloud(currentCid);
        }
    }

    static async checkSubInCloud(cid) {
        const ReqClass = typeof Req115 !== 'undefined' ? Req115 : (typeof window.Req115 !== 'undefined' ? window.Req115 : null);
        if (!ReqClass) return;
        try {
            const res = await ReqClass.filesAll(cid);
            const hasSub = res?.data?.some(f => /\.(srt|ass|ssa|vtt|sub)$/i.test(f.n));
            this.hasSubInCloud = !!hasSub;
            this.updateButtonUI(this.hasSubInCloud ? 'cloud_exists' : 'default');
        } catch (e) { }
    }

    static updateButtonUI(state) {
        const btn = document.getElementById(this.BTN_ID);
        if (!btn) return;
        if (state === 'cloud_exists') {
            btn.innerHTML = '已有字幕';
            btn.style.cssText = 'margin-left: 6px; transition: all 0.2s; background-color: #67c23a; border-color: #67c23a; color: #fff;';
        } else {
            btn.innerHTML = '字幕搜索';
            btn.style.cssText = 'margin-left: 6px; transition: all 0.2s; background-color: #7b5ea7; border-color: #7b5ea7; color: #fff;';
        }
    }

    static createSearchButton(targetAnchor) {
        const btn = document.createElement('button');
        btn.id = this.BTN_ID;
        btn.className = 'west-engine-btn';
        btn.onclick = () => this.openSearchModal();
        targetAnchor.insertAdjacentElement('afterend', btn);
        this.hasSubInCloud = false;
        this.updateButtonUI('default');
    }

    static async openSearchModal() {
        const details = document.WESTDETAILS || {};
        const kwInput = document.getElementById('jav-nong-kw');
        const magKw = kwInput ? kwInput.value.trim() : '';

        // 【核心优化】：提取第一位演员，并将所有内部空格转化为点号
        let firstActor = '';
        if (details.actors && details.actors.length > 0) {
            firstActor = details.actors[0].trim();
        } else if (details.actor && details.actor !== 'Unknown_Actor') {
            firstActor = details.actor.split('&')[0].trim();
        }
        if (firstActor) {
            firstActor = firstActor.replace(/\s+/g, '.'); // 空格转点号
        }

        let defaultKw = '';
        if (details.matchPrefix) {
            defaultKw = details.matchPrefix.trim();
            if (firstActor) defaultKw += '.' + firstActor; // 厂牌.日期.演员.名
        } else if (magKw) {
            defaultKw = magKw;
        } else {
            defaultKw = details.titleKeyword || details.titlePart || document.title;
        }

        const overlayId = 'west-subtitle-modal';
        if (document.getElementById(overlayId)) document.getElementById(overlayId).remove();

        const overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 9999999; display: flex; justify-content: center; align-items: center;';

        const box = document.createElement('div');
        box.style.cssText = 'width: 90%; max-width: 1200px; height: 85vh; background: #fff; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; position: relative;';

        const header = document.createElement('div');
        header.style.cssText = 'padding: 15px; background: #f5f5f5; border-bottom: 1px solid #e8e8e8; display: flex; justify-content: space-between; align-items: center;';
        header.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; flex:1;">
                <span style="font-weight:bold; font-size:15px; color:#333;">迅雷字幕检索:</span>
                <input type="text" id="sub-search-input" value="${defaultKw}" style="padding:6px 10px; border:1px solid #dcdfe6; border-radius:4px; font-size:13px; width:50%; outline:none; color:#303133; background:#fff;" placeholder="输入检索词..." />
                <button id="sub-search-btn" style="padding:6px 15px; background:#7b5ea7; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold;">重新搜索</button>
            </div>
            <span style="cursor:pointer; color:#999; font-size:24px; line-height:1; margin-left:15px;" id="sub-close-btn">&times;</span>
        `;

        const bodyContainer = document.createElement('div');
        bodyContainer.style.cssText = 'display: flex; flex: 1; overflow: hidden;';

        const contentWrap = document.createElement('div');
        contentWrap.style.cssText = 'flex: 7; width: 0; padding: 15px; overflow-y: auto; border-right: 1px solid #e8e8e8;';

        const previewWrap = document.createElement('div');
        previewWrap.style.cssText = 'flex: 3; width: 0; padding: 15px; display: flex; flex-direction: column; background: #fafafa;';

        const previewTitle = document.createElement('div');
        previewTitle.style.cssText = 'font-weight: bold; margin-bottom: 10px; color: #333; display: flex; justify-content: space-between; align-items: center;';
        previewTitle.innerHTML = '<span>字幕内容预览</span><span id="preview-status" style="font-weight:normal; color:#999; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:60%;">暂无预览</span>';

        const previewBox = document.createElement('textarea');
        previewBox.style.cssText = 'flex: 1; width: 100%; padding: 10px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; resize: none; outline: none; font-size: 13px; color: #333; box-sizing: border-box; font-family: Consolas, monospace; line-height: 1.5;';
        previewBox.readOnly = true;

        previewWrap.appendChild(previewTitle);
        previewWrap.appendChild(previewBox);
        bodyContainer.appendChild(contentWrap);
        bodyContainer.appendChild(previewWrap);
        box.appendChild(header);
        box.appendChild(bodyContainer);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const closeModal = () => { overlay.remove(); previewBox.value = ''; };
        header.querySelector('#sub-close-btn').onclick = closeModal;
        overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

        const performSearch = (kw) => {
            if (!kw) return;
            contentWrap.innerHTML = '<div style="text-align:center; padding: 30px; color:#666;">正在连接迅雷字幕接口，请稍候...</div>';
            previewBox.value = '';
            const statusNode = overlay.querySelector('#preview-status');
            if (statusNode) statusNode.innerText = '暂无预览';

            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=${encodeURIComponent(kw)}`,
                    onload: (res) => {
                        try {
                            const root = JSON.parse(res.responseText);
                            if (root.code === 0 && root.data && root.data.length > 0) {
                                let dataList = root.data;

                                // 【核心优化】：分词打分器，杜绝完全匹配失效的问题
                                const kwClean = kw.toLowerCase().replace(/[-_\.\s]/g, '');
                                const kwTokens = kw.toLowerCase().split(/[-_\.\s]+/).filter(w => w.length > 1);

                                dataList.sort((a, b) => {
                                    let scoreA = 0, scoreB = 0;
                                    const nameA = (a.name || a.extra_name || '').toLowerCase();
                                    const nameB = (b.name || b.extra_name || '').toLowerCase();
                                    const langA = ((a.languages && a.languages[0]) || '').toLowerCase();
                                    const langB = ((b.languages && b.languages[0]) || '').toLowerCase();

                                    // 1. 分词累加得分：命中越多的搜索词，得分越高 (+50/词)
                                    kwTokens.forEach(t => {
                                        if (nameA.includes(t)) scoreA += 50;
                                        if (nameB.includes(t)) scoreB += 50;
                                    });

                                    // 2. 绝对匹配特权：忽略符号后，整体全部包含 (+500)
                                    if (nameA.replace(/[-_\.\s]/g, '').includes(kwClean)) scoreA += 500;
                                    if (nameB.replace(/[-_\.\s]/g, '').includes(kwClean)) scoreB += 500;

                                    // 3. 语言与格式兜底
                                    if (/zh|cn|chs|cht|中字|简|繁/.test(langA) || /中字|简|繁|chs|cht/.test(nameA)) scoreA += 100;
                                    if (/zh|cn|chs|cht|中字|简|繁/.test(langB) || /中字|简|繁|chs|cht/.test(nameB)) scoreB += 100;
                                    if (a.ext === 'srt' || a.ext === 'ass') scoreA += 20;
                                    if (b.ext === 'srt' || b.ext === 'ass') scoreB += 20;

                                    return scoreB - scoreA;
                                });

                                this.renderTable(contentWrap, dataList, previewBox, overlay, kw);
                            } else {
                                contentWrap.innerHTML = '<div style="text-align:center; padding: 30px; color:#999;">未找到相关字幕，请尝试删减搜索词</div>';
                            }
                        } catch (e) {
                            contentWrap.innerHTML = '<div style="text-align:center; padding: 30px; color:#dc3545;">API 数据解析失败</div>';
                        }
                    },
                    onerror: () => { contentWrap.innerHTML = '<div style="text-align:center; padding: 30px; color:#dc3545;">请求失败，请检查网络设置</div>'; }
                });
            } catch (e) { contentWrap.innerHTML = `<div style="text-align:center; padding: 30px; color:#dc3545;">${e.message}</div>`; }
        };

        header.querySelector('#sub-search-btn').onclick = () => performSearch(header.querySelector('#sub-search-input').value.trim());
        header.querySelector('#sub-search-input').onkeypress = (e) => { if (e.key === 'Enter') performSearch(e.target.value.trim()); };

        performSearch(defaultKw);
    }

    static renderTable(container, dataList, previewBox, overlay, kw = '') {
        // 高亮分词正则，基于点号和横杠切分
        const kwWords = kw.split(/[-_\.\s]+/).filter(w => w.length > 1);
        let highlightRegex = null;
        if (kwWords.length > 0) {
            const escapedWords = kwWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            highlightRegex = new RegExp('(' + escapedWords.join('|') + ')', 'gi');
        }
        const kwClean = kw.toLowerCase().replace(/[-_\.\s]/g, '');

        let tableHtml = `
            <table style="width:100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead>
                    <tr style="background: #f9f9f9; border-bottom: 2px solid #e8e8e8;">
                        <th style="padding: 10px; color:#333;">原始字幕名称</th>
                        <th style="padding: 10px; width: 80px; color:#333;">语言</th>
                        <th style="padding: 10px; width: 60px; color:#333;">格式</th>
                        <th style="padding: 10px; width: 170px; text-align:center; color:#333;">操作</th>
                    </tr>
                </thead>
                <tbody>
        `;

        dataList.forEach((item, index) => {
            const lang = (item.languages && item.languages.length > 0) ? item.languages[0] : '未知';
            let subName = item.name || item.extra_name || '未知字幕';
            const subNameClean = subName.toLowerCase().replace(/[-_\.\s]/g, '');

            // 是否包含所有的搜索分词 (决定是否显示🔥图标)
            const isExactMatch = kwClean && subNameClean.includes(kwClean);

            let displayName = subName;
            if (highlightRegex) {
                displayName = displayName.replace(highlightRegex, '<span style="color:#e74c3c; font-weight:bold;">$1</span>');
            }

            const topIcon = isExactMatch ? '<span style="color:#e74c3c; font-size:12px; margin-right:4px;" title="精确匹配">🔥</span>' : '';
            const tdStyle = isExactMatch ? 'color:#333; font-weight:bold;' : 'color:#555;';

            tableHtml += `
                <tr style="border-bottom: 1px dashed #f0f0f0;">
                    <td style="padding: 10px; word-break: break-all; ${tdStyle}">${topIcon}${displayName}</td>
                    <td style="padding: 10px; color:#666;">${lang}</td>
                    <td style="padding: 10px; font-weight:bold; color:#7b5ea7;">${item.ext || 'srt'}</td>
                    <td style="padding: 10px; text-align:center; white-space:nowrap;">
                        <button class="sub-action-btn" data-action="preview" data-idx="${index}" style="margin-right:4px; padding:5px 10px; background:#19c5b7; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">预览</button>
                        <button class="sub-action-btn" data-action="download" data-idx="${index}" style="margin-right:4px; padding:5px 10px; background:#e6a23c; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">下载</button>
                        <button class="sub-action-btn" data-action="upload" data-idx="${index}" style="padding:5px 10px; background:#5470d8; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">115直传</button>
                    </td>
                </tr>
            `;
        });
        tableHtml += `</tbody></table>`;
        container.innerHTML = tableHtml;

        const self = this;
        container.querySelectorAll('.sub-action-btn').forEach(btn => {
            btn.onclick = async function () {
                const action = this.dataset.action;
                const item = dataList[this.dataset.idx];
                const url = item.url;
                if (!url) return alert('无效的字幕下载直链');

                const format = item.ext || 'srt';
                const standardName = window.PornBookmark ? window.PornBookmark.getStandardizedFilename() : document.title.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, ' ').trim();
                const finalFilename = `${standardName}.${format}`;

                const originalText = this.textContent;
                this.textContent = '获取中...';
                this.style.opacity = '0.6';

                try {
                    const buffer = await self.fetchBinary(url);
                    if (action === 'preview') {
                        // [MOD] 增加智能编码嗅探：解决由于写死 UTF-8 导致的老式 GBK 字幕乱码问题
                        let decoder = new TextDecoder('utf-8');
                        let textResult = decoder.decode(buffer);

                        // [MOD] 修复正则被吞噬的语法错误：使用安全的 \uFFFD 代表乱码字符()，并增加 || [] 防止 null 报错
                        const errorCount = (textResult.match(/\uFFFD/g) || []).length;
                        if (errorCount > 3) {
                            // 若发现明显乱码，切换至中文常用的 gbk 重新解码
                            decoder = new TextDecoder('gbk');
                            textResult = decoder.decode(buffer);
                        }

                        previewBox.value = textResult;
                        const statusNode = document.getElementById('preview-status');
                        if (statusNode) statusNode.innerText = finalFilename;
                    } else if (action === 'download') {
                        const blob = new Blob([buffer], { type: 'application/octet-stream' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = finalFilename;
                        link.click();
                        URL.revokeObjectURL(link.href);
                    } else if (action === 'upload') {
                        const matchedBtn = document.querySelector('.x-match-btn-wide');
                        const targetCid = matchedBtn ? matchedBtn.dataset.cid : null;
                        const ReqClass = typeof Req115 !== 'undefined' ? Req115 : (typeof window.Req115 !== 'undefined' ? window.Req115 : null);
                        if (!targetCid || !ReqClass) throw new Error('未检测到 115 归档目录，请先等待主界面刮削或匹配完毕！');

                        this.textContent = '直传中...';
                        const blob = new Blob([buffer], { type: 'application/octet-stream' });
                        const fileObj = new File([blob], finalFilename, { type: 'application/octet-stream' });
                        const initRes = await ReqClass.sampleInitUpload({ filename: finalFilename, filesize: fileObj.size, cid: targetCid });
                        // [MOD] 增加极速秒传校验，并校验 OSS 真实回调 JSON 结果
                        if (initRes && (initRes.host || initRes.status === 2 || initRes.statuscode === 0)) {
                            if (initRes.host) {
                                // [MOD] 字幕专用的重试机制：精准使用 finalFilename 变量
                                let uploadRes = null;
                                for (let retry = 0; retry < 3; retry++) {
                                    uploadRes = await ReqClass.upload({ ...initRes, filename: finalFilename, file: fileObj });
                                    if (uploadRes && uploadRes.state !== false) break;
                                    await new Promise(r => setTimeout(r, 1500));
                                }
                                if (uploadRes && uploadRes.state === false) throw new Error(uploadRes.error_msg || uploadRes.error || "115 服务器拒绝接收回调");
                            }
                            self.hasSubInCloud = true;
                            self.updateButtonUI('cloud_exists');
                            alert('字幕归档成功，已推入115云端目录！');
                            overlay.remove();
                        } else {
                            throw new Error(initRes?.error_msg || "获取115上传安全凭证被拦截");
                        }
                    }
                } catch (e) {
                    alert(`执行中止: ${e.message}`);
                } finally {
                    this.textContent = originalText;
                    this.style.opacity = '1';
                }
            };
        });
    }

    static fetchBinary(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                onload: (res) => {
                    if (res.status === 200 && res.response) resolve(res.response);
                    else reject(new Error('字幕流获取失败，HTTP_CODE: ' + res.status));
                },
                onerror: () => reject(new Error('跨域网络请求被阻断'))
            });
        });
    }
};