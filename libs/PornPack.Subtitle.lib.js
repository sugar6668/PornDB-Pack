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
        
        // 挂载点：紧跟在书签按钮模块的后面，如果书签未生成，则降级挂载到复制按钮后
        const pbfBtn = document.getElementById('export-pbf-btn');
        const targetAnchor = pbfBtn ? pbfBtn.parentElement : document.getElementById('btn-copy-kw');
        
        if (targetAnchor && !document.getElementById(this.BTN_ID)) {
            this.createSearchButton(targetAnchor);
            this.checkedCid = null;
        }

        // 动态检测 115 匹配状态
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
            // 检测常见字幕后缀
            const hasSub = res?.data?.some(f => /\.(srt|ass|ssa|vtt|sub)$/i.test(f.n));
            this.hasSubInCloud = !!hasSub;
            this.updateButtonUI(this.hasSubInCloud ? 'cloud_exists' : 'default');
        } catch (e) {}
    }

    static updateButtonUI(state) {
        const btn = document.getElementById(this.BTN_ID);
        if (!btn) return;

        if (state === 'cloud_exists') {
            btn.innerHTML = '已有字幕';
            btn.style.backgroundColor = '#67c23a';
            btn.style.borderColor = '#67c23a';
            btn.style.color = '#fff';
            btn.onmouseover = () => btn.style.backgroundColor = '#85ce61';
            btn.onmouseout = () => btn.style.backgroundColor = '#67c23a';
        } else {
            btn.innerHTML = '字幕搜索';
            btn.style.backgroundColor = '#7b5ea7';
            btn.style.borderColor = '#7b5ea7';
            btn.style.color = '#fff';
            btn.onmouseover = () => btn.style.backgroundColor = '#937bc2';
            btn.onmouseout = () => btn.style.backgroundColor = '#7b5ea7';
        }
    }

    static createSearchButton(targetAnchor) {
        const btn = document.createElement('button');
        btn.id = this.BTN_ID;
        btn.className = 'west-engine-btn';
        btn.style.cssText = 'margin-left: 6px; transition: all 0.2s;';
        btn.onclick = () => this.openSearchModal();
        targetAnchor.insertAdjacentElement('afterend', btn);
        
        this.hasSubInCloud = false;
        this.updateButtonUI('default');
    }

    static async openSearchModal() {
        // 直接提取磁力面板的纯净关键词 (已过滤各种非法字符并提纯)
        const kwInput = document.getElementById('jav-nong-kw');
        const kw = kwInput ? kwInput.value.trim() : '';
        if (!kw) return alert('请先等待或在磁力面板输入有效的番号/关键词！');

        const overlayId = 'west-subtitle-modal';
        if (document.getElementById(overlayId)) document.getElementById(overlayId).remove();

        const overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 9999999; display: flex; justify-content: center; align-items: center;';
        
        const box = document.createElement('div');
        box.style.cssText = 'width: 80%; max-width: 900px; max-height: 80vh; background: #fff; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; position: relative;';
        
        const header = document.createElement('div');
        header.style.cssText = 'padding: 15px; background: #f5f5f5; border-bottom: 1px solid #e8e8e8; display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 16px; color: #333;';
        header.innerHTML = `<span>迅雷字幕库检索: ${kw}</span><span style="cursor:pointer; color:#999; font-size:22px; line-height:1;" id="sub-close-btn">&times;</span>`;
        
        const contentWrap = document.createElement('div');
        contentWrap.style.cssText = 'padding: 15px; overflow-y: auto; flex: 1;';
        contentWrap.innerHTML = '<div style="text-align:center; padding: 30px; color:#666;">正在连接迅雷字幕接口，请稍候...</div>';

        // 用于预览内存字幕文本的底盒
        const previewBox = document.createElement('textarea');
        previewBox.style.cssText = 'display:none; width: 100%; height: 200px; margin-top: 15px; padding: 10px; border: 1px solid #e8e8e8; border-radius: 4px; background: #fafafa; resize: none; outline: none; font-size: 13px; color: #333; box-sizing: border-box;';
        previewBox.readOnly = true;

        box.appendChild(header);
        box.appendChild(contentWrap);
        box.appendChild(previewBox);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const closeModal = () => { overlay.remove(); previewBox.value = ''; };
        header.querySelector('#sub-close-btn').onclick = closeModal;
        overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

        try {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=${encodeURIComponent(kw)}`,
                onload: (res) => {
                    try {
                        const root = JSON.parse(res.responseText);
                        if (root.code === 0 && root.data && root.data.length > 0) {
                            this.renderTable(contentWrap, root.data, previewBox, overlay);
                        } else {
                            contentWrap.innerHTML = '<div style="text-align:center; padding: 30px; color:#999;">未找到相关字幕，可能是生肉或关键词不精确</div>';
                        }
                    } catch (e) {
                        contentWrap.innerHTML = '<div style="text-align:center; padding: 30px; color:#dc3545;">API 数据解析失败</div>';
                    }
                },
                onerror: () => {
                    contentWrap.innerHTML = '<div style="text-align:center; padding: 30px; color:#dc3545;">请求失败，请检查跨域网络设置</div>';
                }
            });
        } catch (e) {
            contentWrap.innerHTML = `<div style="text-align:center; padding: 30px; color:#dc3545;">${e.message}</div>`;
        }
    }

    static renderTable(container, dataList, previewBox, overlay) {
        let tableHtml = `
            <table style="width:100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead>
                    <tr style="background: #f9f9f9; border-bottom: 2px solid #e8e8e8;">
                        <th style="padding: 10px; color:#333;">原始字幕名称</th>
                        <th style="padding: 10px; width: 80px; color:#333;">语言</th>
                        <th style="padding: 10px; width: 60px; color:#333;">格式</th>
                        <th style="padding: 10px; width: 220px; text-align:center; color:#333;">操作</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        dataList.forEach((item, index) => {
            const lang = (item.languages && item.languages.length > 0) ? item.languages[0] : '未知';
            tableHtml += `
                <tr style="border-bottom: 1px dashed #f0f0f0;">
                    <td style="padding: 10px; word-break: break-all; color:#555;">${item.name || item.extra_name || '未知字幕'}</td>
                    <td style="padding: 10px; color:#666;">${lang}</td>
                    <td style="padding: 10px; font-weight:bold; color:#7b5ea7;">${item.ext || 'srt'}</td>
                    <td style="padding: 10px; text-align:center; white-space:nowrap;">
                        <button class="sub-action-btn" data-action="preview" data-idx="${index}" style="margin-right:6px; padding:5px 10px; background:#19c5b7; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">预览</button>
                        <button class="sub-action-btn" data-action="download" data-idx="${index}" style="margin-right:6px; padding:5px 10px; background:#e6a23c; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">下载</button>
                        <button class="sub-action-btn" data-action="upload" data-idx="${index}" style="padding:5px 10px; background:#5470d8; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">115云推</button>
                    </td>
                </tr>
            `;
        });
        tableHtml += `</tbody></table>`;
        container.innerHTML = tableHtml;

        const self = this;
        container.querySelectorAll('.sub-action-btn').forEach(btn => {
            btn.onclick = async function() {
                const action = this.dataset.action;
                const item = dataList[this.dataset.idx];
                const url = item.url;
                if (!url) return alert('无效的字幕下载直链');
                
                const format = item.ext || 'srt';
                // 核心：复用书签模块的命名清洗逻辑，统一字幕与视频的名称
                const standardName = window.PornBookmark ? window.PornBookmark.getStandardizedFilename() : document.title.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, ' ').trim();
                // 拼接最终扩展名
                const finalFilename = `${standardName}.${format}`;

                const originalText = this.textContent;
                this.textContent = '获取中...';
                this.style.opacity = '0.6';

                try {
                    const buffer = await self.fetchBinary(url);
                    
                    if (action === 'preview') {
                        // 利用 TextDecoder 解码 ArrayBuffer 并推入文本域
                        const decoder = new TextDecoder('utf-8'); 
                        previewBox.value = decoder.decode(buffer);
                        previewBox.style.display = 'block';
                    } 
                    else if (action === 'download') {
                        const blob = new Blob([buffer], { type: 'application/octet-stream' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = finalFilename;
                        link.click();
                        URL.revokeObjectURL(link.href);
                    } 
                    else if (action === 'upload') {
                        const matchedBtn = document.querySelector('.x-match-btn-wide');
                        const targetCid = matchedBtn ? matchedBtn.dataset.cid : null;
                        const ReqClass = typeof Req115 !== 'undefined' ? Req115 : (typeof window.Req115 !== 'undefined' ? window.Req115 : null);
                        
                        if (!targetCid || !ReqClass) throw new Error('未检测到 115 归档目录，请先等待主界面刮削或匹配完毕！');
                        
                        this.textContent = '直传中...';
                        
                        // 强制构造标准 File 实体通过 115 的文件校验层
                        const blob = new Blob([buffer], { type: 'application/octet-stream' });
                        const fileObj = new File([blob], finalFilename, { type: 'application/octet-stream' });
                        
                        const initRes = await ReqClass.sampleInitUpload({ filename: finalFilename, filesize: fileObj.size, cid: targetCid });
                        if (initRes && initRes.host) {
                            await ReqClass.upload({ ...initRes, filename: finalFilename, file: fileObj });
                            // 上传成功，同步刷新外部按钮状态
                            self.hasSubInCloud = true;
                            self.updateButtonUI('cloud_exists');
                            alert('字幕归档成功，已推入115云端目录！');
                            overlay.remove(); // 任务完成自动关闭弹窗
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
                responseType: 'arraybuffer', // [MOD] 强行以二进制流接收防止乱码
                onload: (res) => {
                    if (res.status === 200 && res.response) resolve(res.response);
                    else reject(new Error('字幕流获取失败，HTTP_CODE: ' + res.status));
                },
                onerror: () => reject(new Error('跨域网络请求被阻断'))
            });
        });
    }
};