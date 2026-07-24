/**
 * @name         PornPack Subtitle Library
 * @description  基于迅雷接口和subtitlecat的字幕检索与 115 云端直传模块
 * @version      1.0.0
 */

window.PornSubtitle = class PornSubtitle {
    static BTN_ID = 'search-subtitle-btn';
    static checkedCid = null;
    static hasSubInCloud = false;
    static CARD_INDICATOR_CLASS = 'pdb-card-subtitle-icon';
    static subtitleCidStates = new Map();

    static isSubtitleFile(file) {
        return /\.(srt|ass|ssa|vtt|sub)$/i.test(String(file?.n || file?.file_name || ''));
    }

    // 卡片匹配结果只保存视频；这里按归档目录补查一次字幕文件，并按 cid 复用查询结果。
    static async hasSubtitleInCid(cid, force = false) {
        const key = String(cid || '');
        if (!key) return false;
        if (force) this.subtitleCidStates.delete(key);
        if (this.subtitleCidStates.has(key)) return this.subtitleCidStates.get(key);

        const task = (async () => {
            const ReqClass = typeof Req115 !== 'undefined' ? Req115 : (typeof window.Req115 !== 'undefined' ? window.Req115 : null);
            if (!ReqClass) return false;
            try {
                const res = await ReqClass.filesAll(key);
                return !!res?.data?.some(file => this.isSubtitleFile(file));
            } catch (e) {
                return false;
            }
        })();
        this.subtitleCidStates.set(key, task);
        return task;
    }

    static renderCardIndicator(card, hasSubtitle) {
        if (!card?.querySelector) return;
        const textRight = card.querySelector('.grid.justify-end.items-center .text-right');
        const host = textRight?.closest('.grid.justify-end.items-center');
        if (!host || !textRight) return;

        let indicator = host.querySelector(`.${this.CARD_INDICATOR_CLASS}`);
        if (!hasSubtitle) {
            if (indicator) indicator.remove();
            host.classList.remove('pdb-card-subtitle-host');
            return;
        }

        if (!indicator) {
            indicator = document.createElement('span');
            indicator.className = this.CARD_INDICATOR_CLASS;
            indicator.title = '网盘内已有字幕';
            indicator.setAttribute('aria-label', '网盘内已有字幕');
            indicator.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M2 12C2 8.22876 2 6.34315 3.17157 5.17157C4.34315 4 6.22876 4 10 4H14C17.7712 4 19.6569 4 20.8284 5.17157C22 6.34315 22 8.22876 22 12C22 15.7712 22 17.6569 20.8284 18.8284C19.6569 20 17.7712 20 14 20H10C6.22876 20 4.34315 20 3.17157 18.8284C2 17.6569 2 15.7712 2 12ZM6 15.25C5.58579 15.25 5.25 15.5858 5.25 16C5.25 16.4142 5.58579 16.75 6 16.75H10C10.4142 16.75 10.75 16.4142 10.75 16C10.75 15.5858 10.4142 15.25 10 15.25H6ZM7.75 13C7.75 12.5858 7.41421 12.25 7 12.25H6C5.58579 12.25 5.25 12.5858 5.25 13C5.25 13.4142 5.58579 13.75 6 13.75H7C7.41421 13.75 7.75 13.4142 7.75 13ZM11.5 12.25C11.9142 12.25 12.25 12.5858 12.25 13C12.25 13.4142 11.9142 13.75 11.5 13.75H9.5C9.08579 13.75 8.75 13.4142 8.75 13C8.75 12.5858 9.08579 12.25 9.5 12.25H11.5ZM18.75 13C18.75 12.5858 18.4142 12.25 18 12.25H14C13.5858 12.25 13.25 12.5858 13.25 13C13.25 13.4142 13.5858 13.75 14 13.75H18C18.4142 13.75 18.75 13.4142 18.75 13ZM12.5 15.25C12.0858 15.25 11.75 15.5858 11.75 16C11.75 16.4142 12.0858 16.75 12.5 16.75H14C14.4142 16.75 14.75 16.4142 14.75 16C14.75 15.5858 14.4142 15.25 14 15.25H12.5ZM15.75 16C15.75 15.5858 16.0858 15.25 16.5 15.25H18C18.4142 15.25 18.75 15.5858 18.75 16C18.75 16.4142 18.4142 16.75 18 16.75H16.5C16.0858 16.75 15.75 16.4142 15.75 16Z" fill="currentColor"></path></svg>';
            host.insertBefore(indicator, textRight);
        }
        host.classList.add('pdb-card-subtitle-host');

        // 紧贴 text-right 前方，并始终与该文字块等高。
        const height = textRight.getBoundingClientRect?.().height;
        if (height > 0) {
            indicator.style.width = `${height}px`;
            indicator.style.height = `${height}px`;
        }
    }

    static async refreshCardIndicator(card, videos, { force = false } = {}) {
        const cids = [...new Set((videos || []).map(video => String(video?.cid || '')).filter(Boolean))];
        if (!cids.length) {
            this.renderCardIndicator(card, false);
            return;
        }
        const checks = await Promise.all(cids.map(cid => this.hasSubtitleInCid(cid, force)));
        this.renderCardIndicator(card, checks.some(Boolean));
    }

    static notifySubtitleUploaded(cid) {
        const detail = { source: 'PornSubtitle', cid: String(cid || '') };
        if (!detail.cid) return;
        this.subtitleCidStates.set(detail.cid, Promise.resolve(true));
        if (window.top && window.top !== window) {
            window.top.postMessage({ type: 'West_Subtitle_Uploaded', detail }, location.origin);
        } else {
            window.dispatchEvent(new CustomEvent('West_Subtitle_Uploaded', { detail }));
        }
    }

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
            const hasSub = res?.data?.some(file => this.isSubtitleFile(file));
            this.hasSubInCloud = !!hasSub;
            this.subtitleCidStates.set(String(cid), Promise.resolve(this.hasSubInCloud));
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
        const firstActor = this.getFirstActor(details);

        let defaultKw = '';
        if (details.matchPrefix) {
            defaultKw = details.matchPrefix.trim();
            // SubtitleCat 实测中演员组合的召回率显著高于纯日期或标题组合。
            if (firstActor) defaultKw += `.${firstActor.replace(/\s+/g, '.')}`;
        } else if (magKw) {
            defaultKw = magKw;
        } else {
            defaultKw = details.titleKeyword || details.titlePart || document.title;
        }

        const overlayId = 'west-subtitle-modal';
        if (document.getElementById(overlayId)) document.getElementById(overlayId).remove();

        const overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.className = 'pdb-sub-overlay';

        const box = document.createElement('div');
        box.className = 'pdb-sub-modal';

        overlay.innerHTML = window.PornUIAssets.templates.subtitleModal(defaultKw);
        document.body.appendChild(overlay);
        const header = overlay.querySelector('.pdb-sub-header');
        const contentWrap = overlay.querySelector('.pdb-sub-content');
        const previewBox = overlay.querySelector('.pdb-sub-textarea');

        const closeModal = () => { overlay.remove(); previewBox.value = ''; };
        header.querySelector('#sub-close-btn').onclick = closeModal;
        overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

        const sourceSelect = header.querySelector('#sub-source-select');
        const performSearch = (kw, { allowActorFallback = false } = {}) => {
            if (!kw) return;
            previewBox.value = '';
            const statusNode = overlay.querySelector('#preview-status');
            if (statusNode) statusNode.innerText = '暂无预览';

            if (sourceSelect.value === 'subtitlecat') {
                contentWrap.innerHTML = '<div class="pdb-sub-msg">正在检索 SubtitleCat，请稍候...</div>';
                this.searchSubtitleCatWithFallback(kw, firstActor, allowActorFallback, details.titlePart || details.titleKeyword)
                    .then(({ items, usedActorFallback }) => {
                        if (items.length) {
                            this.renderTable(contentWrap, items, previewBox, overlay, kw);
                        } else {
                            contentWrap.innerHTML = `<div class="pdb-sub-msg">SubtitleCat 未找到与「${this.escapeHtml(kw)}」匹配的字幕${usedActorFallback ? '（已按演员名再次测试）' : ''}</div>`;
                        }
                        if (usedActorFallback) header.querySelector('#sub-search-input').value = `${kw}.${firstActor.replace(/\s+/g, '.')}`;
                    })
                    .catch((e) => { contentWrap.innerHTML = `<div class="pdb-sub-msg pdb-sub-error">SubtitleCat 请求失败：${this.escapeHtml(e.message)}</div>`; });
                return;
            }

            if (sourceSelect.value === 'all') {
                contentWrap.innerHTML = '<div class="pdb-sub-msg">正在并行检索 迅雷字幕 与 SubtitleCat，请稍候...</div>';
                Promise.allSettled([
                    this.searchXunlei(kw),
                    this.searchSubtitleCatWithFallback(kw, firstActor, allowActorFallback, details.titlePart || details.titleKeyword)
                ]).then(([xunlei, subtitleCat]) => {
                    const dataList = [
                        ...(xunlei.status === 'fulfilled' ? xunlei.value : []),
                        ...(subtitleCat.status === 'fulfilled' ? subtitleCat.value.items : [])
                    ];
                    if (dataList.length) this.renderTable(contentWrap, dataList, previewBox, overlay, kw);
                    else contentWrap.innerHTML = '<div class="pdb-sub-msg">两个字幕源都未找到相关字幕</div>';
                }).catch((e) => { contentWrap.innerHTML = `<div class="pdb-sub-msg pdb-sub-error">字幕搜索失败：${this.escapeHtml(e.message)}</div>`; });
                return;
            }

            contentWrap.innerHTML = '<div class="pdb-sub-msg">正在连接迅雷字幕接口，请稍候...</div>';
            this.searchXunlei(kw)
                .then(dataList => dataList.length
                    ? this.renderTable(contentWrap, dataList, previewBox, overlay, kw)
                    : contentWrap.innerHTML = '<div class="pdb-sub-msg">未找到相关字幕，请尝试删减搜索词</div>')
                .catch((e) => { contentWrap.innerHTML = `<div class="pdb-sub-msg pdb-sub-error">迅雷字幕请求失败：${this.escapeHtml(e.message)}</div>`; });
        };

        header.querySelector('#sub-search-btn').onclick = () => performSearch(header.querySelector('#sub-search-input').value.trim());
        header.querySelector('#sub-search-input').onkeypress = (e) => { if (e.key === 'Enter') performSearch(e.target.value.trim()); };
        sourceSelect.onchange = () => performSearch(header.querySelector('#sub-search-input').value.trim(), { allowActorFallback: true });

        performSearch(defaultKw, { allowActorFallback: true });
    }

    static searchXunlei(keyword) {
        const url = `https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=${encodeURIComponent(keyword)}`;
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url, timeout: 15000,
                onload: (res) => {
                    try {
                        const root = JSON.parse(res.responseText || '{}');
                        if (root.code !== 0 || !Array.isArray(root.data)) return resolve([]);
                        const kwClean = keyword.toLowerCase().replace(/[-_\.\s]/g, '');
                        const kwTokens = keyword.toLowerCase().split(/[-_\.\s]+/).filter(word => word.length > 1);
                        const score = item => {
                            const name = (item.name || item.extra_name || '').toLowerCase();
                            const lang = ((item.languages && item.languages[0]) || '').toLowerCase();
                            let total = kwTokens.reduce((sum, token) => sum + (name.includes(token) ? 50 : 0), 0);
                            if (name.replace(/[-_\.\s]/g, '').includes(kwClean)) total += 500;
                            if (/zh|cn|chs|cht|中字|简|繁/.test(lang) || /中字|简|繁|chs|cht/.test(name)) total += 100;
                            if (item.ext === 'srt' || item.ext === 'ass') total += 20;
                            return total;
                        };
                        resolve(root.data.map(item => ({ ...item, source: '迅雷字幕' })).sort((a, b) => score(b) - score(a)));
                    } catch (e) { reject(new Error('API 数据解析失败')); }
                },
                onerror: () => reject(new Error('网络请求失败')),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    static getFirstActor(details = {}) {
        const actor = Array.isArray(details.actors) && details.actors.length
            ? details.actors[0]
            : (details.actor && details.actor !== 'Unknown_Actor' ? details.actor.split('&')[0] : '');
        return String(actor || '').trim();
    }

    static escapeHtml(value) {
        return String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
    }

    static normalizeSubtitleText(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    // SubtitleCat 对点号日期按散词检索，会返回同厂牌的泛结果；仅把同时命中日期或演员的行作为可用结果。
    static isSubtitleCatMatch(item, baseKw, actor = '') {
        const name = this.normalizeSubtitleText(item.name);
        const [, maker = '', date = ''] = String(baseKw || '').match(/^(.*?)\.(\d{2}\.\d{2}\.\d{2})(?:\.|$)/) || [];
        const makerClean = this.normalizeSubtitleText(maker);
        const dateClean = this.normalizeSubtitleText(date);
        if (!makerClean || !name.includes(makerClean)) return false;
        if (actor) return name.includes(this.normalizeSubtitleText(actor));
        return !!dateClean && name.includes(dateClean);
    }

    static rankSubtitleCatMatches(items, title = '') {
        const tokens = String(title).toLowerCase().match(/[a-z0-9]{3,}/g) || [];
        if (!tokens.length) return items;
        const score = item => {
            const name = String(item.name || '').toLowerCase();
            return tokens.reduce((total, token) => total + (name.includes(token) ? 1 : 0), 0);
        };
        return [...items].sort((a, b) => score(b) - score(a));
    }

    static async searchSubtitleCatWithFallback(baseKw, firstActor = '', allowActorFallback = false, title = '') {
        const primary = await this.searchSubtitleCat(baseKw);
        const actorClean = this.normalizeSubtitleText(firstActor);
        const hasActorInQuery = actorClean && this.normalizeSubtitleText(baseKw).includes(actorClean);
        const primaryMatches = primary.filter(item => this.isSubtitleCatMatch(item, baseKw, hasActorInQuery ? firstActor : ''));
        if (primaryMatches.length || hasActorInQuery || !allowActorFallback || !firstActor) return { items: this.rankSubtitleCatMatches(primaryMatches, title), usedActorFallback: false };

        const actorKw = `${baseKw}.${firstActor.replace(/\s+/g, '.')}`;
        const actorResults = await this.searchSubtitleCat(actorKw);
        return {
            items: this.rankSubtitleCatMatches(actorResults.filter(item => this.isSubtitleCatMatch(item, baseKw, firstActor)), title),
            usedActorFallback: true
        };
    }

    static searchSubtitleCat(keyword) {
        const url = `https://www.subtitlecat.com/index.php?search=${encodeURIComponent(keyword)}`;
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url, timeout: 15000,
                headers: { Accept: 'text/html', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
                onload: (res) => {
                    if (res.status !== 200) return reject(new Error(`HTTP ${res.status}`));
                    const doc = new DOMParser().parseFromString(res.responseText || '', 'text/html');
                    const seen = new Set();
                    const items = [...doc.querySelectorAll('tr')].map(row => {
                        const cells = row.querySelectorAll('td');
                        const link = cells[0]?.querySelector('a[href]');
                        if (!link || cells.length < 4) return null;
                        const source = (cells[0].textContent.match(/\(translated from ([^)]+)\)/i) || [])[1] || 'Unknown';
                        return {
                            name: link.textContent.trim(),
                            languages: [source],
                            source: 'SubtitleCat',
                            ext: 'srt',
                            detailUrl: new URL(link.getAttribute('href'), 'https://www.subtitlecat.com/').href
                        };
                    }).filter(item => item && !seen.has(item.detailUrl) && (seen.add(item.detailUrl), true));
                    resolve(items);
                },
                onerror: () => reject(new Error('网络请求失败')),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
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
            <table class="pdb-sub-table">
                <thead>
                    <tr>
                        <th class="pdb-sub-th">原始字幕名称</th>
                        <th class="pdb-sub-th" style="width: 80px;">语言</th>
                        <th class="pdb-sub-th" style="width: 60px;">格式</th>
                        <th class="pdb-sub-th" style="width: 170px; text-align:center;">操作</th>
                    </tr>
                </thead>
                <tbody>
        `;

        let lastSource = '';
        dataList.forEach((item, index) => {
            const source = item.source || '迅雷字幕';
            if (source !== lastSource) {
                tableHtml += `<tr class="pdb-sub-source-row"><td colspan="4">${this.escapeHtml(source)}</td></tr>`;
                lastSource = source;
            }
            const lang = (item.languages && item.languages.length > 0) ? item.languages[0] : '未知';
            let subName = item.name || item.extra_name || '未知字幕';
            const subNameClean = subName.toLowerCase().replace(/[-_\.\s]/g, '');

            // 是否包含所有的搜索分词 (决定是否显示🔥图标)
            const isExactMatch = kwClean && subNameClean.includes(kwClean);

            let displayName = this.escapeHtml(subName);
            if (highlightRegex) {
                displayName = displayName.replace(highlightRegex, '<span style="color:#e74c3c; font-weight:bold;">$1</span>');
            }

            const topIcon = isExactMatch ? '<span style="color:#e74c3c; font-size:12px; margin-right:4px;" title="精确匹配">🔥</span>' : '';
            const tdStyle = isExactMatch ? 'color:#333; font-weight:bold;' : 'color:#555;';

            tableHtml += `
                <tr class="pdb-sub-tr">
                    <td class="pdb-sub-td" style="${tdStyle}">${topIcon}${displayName}</td>
                    <td class="pdb-sub-td-lang">${lang}</td>
                    <td class="pdb-sub-td-ext">${item.ext || 'srt'}</td>
                    <td class="pdb-sub-td-actions">
                        <button class="sub-action-btn pdb-sub-action-btn pdb-sub-btn-preview" data-action="preview" data-idx="${index}">预览</button>
                        <button class="sub-action-btn pdb-sub-action-btn pdb-sub-btn-download" data-action="download" data-idx="${index}">下载</button>
                        <button class="sub-action-btn pdb-sub-action-btn pdb-sub-btn-upload" data-action="upload" data-idx="${index}">115直传</button>
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
                const format = item.ext || 'srt';
                const standardName = window.PornBookmark ? window.PornBookmark.getStandardizedFilename() : document.title.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, ' ').trim();
                const finalFilename = `${standardName}.${format}`;

                const originalText = this.textContent;
                this.textContent = '获取中...';
                this.style.opacity = '0.6';

                try {
                    const url = await self.resolveSubtitleUrl(item);
                    if (!url) throw new Error('无效的字幕下载直链');
                    const buffer = await self.fetchBinary(url);
                    // [ADD] 核心防御：提前解码拦截阿里云 OSS 的失效报错，防止垃圾代码污染预览、下载或 115 直传
                    let defaultDecoder = new TextDecoder('utf-8');
                    let baseText = defaultDecoder.decode(buffer);
                    if (baseText.includes('<?xml') && baseText.includes('<Code>NoSuchKey</Code>')) {
                        throw new Error('该字幕在迅雷云端已失效丢失 (NoSuchKey)');
                    }

                    if (action === 'preview') {
                        let textResult = baseText; // [MOD] 复用上面已解码的文本，提升性能

                        // 乱码探测与 GBK 降级兜底
                        const errorCount = (textResult.match(/\uFFFD/g) || []).length;
                        if (errorCount > 3) {
                            let gbkDecoder = new TextDecoder('gbk');
                            textResult = gbkDecoder.decode(buffer);
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
                            self.notifySubtitleUploaded(targetCid);
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

    static fetchText(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url, timeout: 15000,
                headers: { Accept: 'text/html' },
                onload: (res) => res.status === 200 ? resolve(res.responseText || '') : reject(new Error(`HTTP ${res.status}`)),
                onerror: () => reject(new Error('详情页请求失败')),
                ontimeout: () => reject(new Error('详情页请求超时'))
            });
        });
    }

    static async resolveSubtitleUrl(item) {
        if (item.url) return item.url;
        if (!item.detailUrl) return '';
        const html = await this.fetchText(item.detailUrl);
        const links = [...html.matchAll(/href=["']([^"']+\.srt(?:\?[^"']*)?)["']/gi)].map(match => match[1]);
        const preferred = links.find(link => /chinese|zh-cn|zh-tw|中文|简体|繁体/i.test(html.slice(Math.max(0, html.indexOf(link) - 300), html.indexOf(link) + 80))) || links[0];
        return preferred ? new URL(preferred, 'https://www.subtitlecat.com/').href : '';
    }
};
