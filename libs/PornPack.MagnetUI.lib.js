/**
 * @name         PornPack Magnet UI Library
 * @description  详情页磁力搜索面板与 115 离线表格 UI 组件
 * @version      1.0.0
 */

window.PornMagnetUI = class PornMagnetUI {
    constructor(options) {
        // 注入依赖
        this.pornArchiver = options.pornArchiver;
        this.gmFetch = options.gmFetch;
        this.updateBtnUI = options.updateBtnUI;
    }

    buildSmartKeyword(details) {
        let maker = (details.maker || '').trim().replace(/\s+/g, '');
        let dateStr = '';
        if (details.dateStr) {
            let parts = details.dateStr.split(/[-.]/);
            if (parts.length === 3) { dateStr = `${parts[0].length === 4 ? parts[0].slice(-2) : parts[0]}.${parts[1]}.${parts[2]}`; }
        }
        return [maker, dateStr].filter(Boolean).join('.');
    }

    fillTable(table, data, details) {
        const self = this; // 捕获类实例，供下方点击事件使用
        table.querySelectorAll('tr:not(.nong-head-row)').forEach(r => r.remove());

        if (!data || !data.length) {
            table.insertAdjacentHTML('beforeend', `<tr><td colspan="4" class="pdb-mag-empty">未找到结果，试试删减上方的关键词，或点击跳转搜索</td></tr>`);
            return;
        }

        const parseSize = (str) => { if (!str) return 0; const m = str.match(/([\d.]+)\s*(GB|MB|KB)/i); if (!m) return 0; let n = parseFloat(m[1]), u = m[2].toUpperCase(); return u === 'GB' ? n * 1024 : (u === 'KB' ? n / 1024 : n); };

        let processedData = data.map(item => {
            item.sizeMB = parseSize(item.size); item.score = 0;
            let dnMatch = item.maglink ? item.maglink.match(/[?&]dn=([^&]+)/i) : null;
            let dnTitle = '';
            if (dnMatch && dnMatch[1]) { try { dnTitle = decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')).trim(); } catch (e) { dnTitle = dnMatch[1].trim(); } }
            if (dnTitle && (!item.title || item.title.length < dnTitle.length || /…|\.\.\.$/.test(item.title))) item.title = dnTitle;
            return item;
        }).filter(item => item.sizeMB > 100 && item.sizeMB < 25600);

        processedData.forEach(item => {
            const tLower = item.title.toLowerCase();
            if (tLower.includes('4k') || tLower.includes('2160p')) item.score += 80; else if (tLower.includes('1080p')) item.score += 40;
            if (item.sizeMB >= 1500 && item.sizeMB <= 8192) item.score += 30;
            if (/(pack|collection|bundle|movies)/i.test(tLower)) item.score -= 80;
        });

        const sortedData = processedData.filter(item => item.score >= 40).sort((a, b) => b.score !== a.score ? b.score - a.score : b.sizeMB - a.sizeMB).slice(0, 10);

        if (!sortedData.length) { table.insertAdjacentHTML('beforeend', `<tr><td colspan="4" class="pdb-mag-empty">资源均被过滤（可能是超大合集），请尝试修改关键词</td></tr>`); return; }

        sortedData.forEach(item => {
            if (!item.maglink) return;
            const tr = document.createElement('tr');
            const isTop = item.score >= 40 ? '<span style="color:#e74c3c;font-size:12px;margin-right:4px;" title="高清推荐">🔥</span>' : '';
            const normalizeTitle = (s) => (s || '').toLowerCase().replace(/[\s._\-:()\[\]]+/g, '');
            const isExactMatch = (normalizeTitle(details.matchPrefix) && normalizeTitle(item.title).includes(normalizeTitle(details.matchPrefix))) || (normalizeTitle(details.fullTitle) && normalizeTitle(item.title) === normalizeTitle(details.fullTitle));
            // [MOD] 彻底清理内联样式，使用精准分配的 Class
            const linkClass = isExactMatch ? 'pdb-mag-link pdb-mag-link-exact' : 'pdb-mag-link pdb-mag-link-normal';

            tr.innerHTML = `
                <td>
                    <span class="nong-magnet-name pdb-mag-name-box" title="${item.title}">
                        ${isTop} <a href="${item.src}" target="_blank" class="${linkClass}">${item.title}</a>
                    </span>
                    ${item.extraHtml || ''} 
                </td>
                <td class="pdb-mag-size-td">${item.size}</td>
                <td class="pdb-mag-action-td"><a class="nong-copy" data-mag="${item.maglink}">复制</a></td>
                <td class="pdb-mag-action-td"><a class="nong-offline-115" data-mag="${item.maglink}">离线刮削</a></td>
            `;

            tr.querySelector('.nong-offline-115').onclick = async (e) => {
                const btn = e.currentTarget;
                if (btn.dataset.busy === '1') return;

                // 增加 Flex 布局，保证图标文字绝对对齐同行
                btn.style.display = 'inline-flex';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';

                const spinner = window.PornUIAssets.icons.spinner14;
                btn.dataset.busy = '1';
                btn.innerHTML = spinner + '<span>建目录...</span>';
                btn.style.color = '#e07b2a';

                try {
                    const magnetHref = btn.dataset.mag;
                    const root = await window.PornDriveAPI.ensureDir('0', '欧美演员');
                    let safeActor = (details.actor || '未知演员').replace(window.PornParser.REGEX_ILLEGAL_PATH, '').trim() || '未知演员';
                    const targetCid = await window.PornDriveAPI.ensureDir(root, safeActor);

                    btn.innerHTML = spinner + '<span>推送...</span>';
                    const addRes = await window.PornDriveAPI.addOfflineTask(magnetHref, targetCid);
                    const realHash = (addRes.info_hash || (magnetHref.match(/btih:([0-9a-zA-Z]{32,40})/i) || [])[1] || '').toLowerCase();
                    btn.dataset.taskhash = realHash;

                    let tags = /chs|cht|sub|中字|-c|_c/i.test(item.title) ? " 中文" : "";
                    let cleanRawTitle = details.titlePart || details.title || '';
                    let maker = details.maker ? details.maker.trim() : '';
                    if (maker && cleanRawTitle.toLowerCase().startsWith(maker.toLowerCase())) { cleanRawTitle = cleanRawTitle.substring(maker.length).replace(/^[^a-zA-Z0-9\u4e00-\u9fa5]+/, '').trim(); }
                    let cleanNewName = ((details.matchPrefix ? `${details.matchPrefix} ${cleanRawTitle}` : details.fullTitle) || '').replace(/\s+/g, ' ').trim() + tags;

                    if (!self.pornArchiver.getQueue().some(q => q.hash === realHash && q.cid === targetCid && q.newName === cleanNewName)) {
                        (async () => {
                            try {
                                await window.PornDriveAPI.sleep(window.PornDriveAPI.rand(4000, 7000));
                                const searchR = await window.PornDriveAPI.safeReq115('GET', `${window.PornDriveAPI.API_115.fileList}?aid=1&cid=0&limit=100&show_dir=1&offset=0&o=user_utime&asc=0`, null, 0, 0);
                                const defaultItems = window.PornDriveAPI.tryJSON(searchR)?.data || [];
                                const misplacedItem = defaultItems.find(f => (Number(f.te || f.t || 0) >= Date.now() / 1000 - 300));
                                if (misplacedItem && String(misplacedItem.cid || '').length > 0) {
                                    const moveData = new URLSearchParams(); moveData.append('pid', String(targetCid));
                                    (misplacedItem.fid ? [misplacedItem.fid] : [misplacedItem.cid]).forEach((id, i) => moveData.append(`fid[${i}]`, id));
                                    await window.PornDriveAPI.safeReq115('POST', 'https://webapi.115.com/files/move', moveData.toString(), 1500, 2500);
                                    self.updateBtnUI(realHash, '已补救移动', '#8e44ad');
                                }
                            } catch (e) { }
                        })();

                        self.pornArchiver.addTask({
                            hash: realHash, newName: cleanNewName, rawTitle: item.title || '', cid: targetCid,
                            baseAlpha: details.baseAlpha || '', dateStr: details.dateStr || '',
                            actors: Array.isArray(details.actors) ? details.actors : (details.actor && details.actor !== 'UnknownActor' ? [details.actor] : []),
                            finalDirArray: ['欧美演员', safeActor, cleanNewName], coverUrl: details.coverUrl, coverName: `${details.baseAlpha}.${details.dateStr}.jpg`,
                            time: Date.now(), stage: 'task', retryCount: 0, failCount: 0, lastError: ''
                        });
                    }

                    // 修复：此时任务刚好进入后台队列等待，属于中间状态，继续显示转圈即可！
                    btn.innerHTML = spinner + '<span>已排队</span>';
                    btn.style.color = '#28a745';
                } catch (e) {
                    alert('磁力离线刮削失败：\n' + e.message);
                    const failIcon = window.PornUIAssets.icons.fail14;
                    btn.innerHTML = failIcon + '<span>失败</span>';
                    btn.style.color = '#dc3545';
                    setTimeout(() => { btn.dataset.busy = '0'; btn.innerHTML = '<span>离线刮削</span>'; btn.style.color = '#7b5ea7'; }, 5000);
                }
            };
            table.appendChild(tr);
        });
    }

    async runSearch(table, kw, engineName, details) {
        table.querySelectorAll('tr:not(.nong-head-row)').forEach(r => r.remove());
        table.insertAdjacentHTML('beforeend', `<tr><td colspan="4" class="pdb-mag-loading"><svg width="18" height="18" viewBox="0 0 24 24" style="vertical-align:middle; animation: spin 1s linear infinite;" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg> 正在检索 [ ${kw} ] ... <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style></td></tr>`);
        try {
            const data = await new window.PornMagnetSearch(this.gmFetch).search(engineName, kw);
            this.fillTable(table, data, details);
        } catch (e) {
            table.querySelectorAll('tr:not(.nong-head-row)').forEach(r => r.remove());
            table.insertAdjacentHTML('beforeend', `<tr><td colspan="4" class="pdb-mag-error">搜索引擎连接失败：${(e && e.message) ? e.message : '请检查网络'}</td></tr>`);
        }
    }

    createMagnetWidget(details) {
        const wrapper = document.createElement('div'); 
        wrapper.className = 'west-unified-box';
        const initKw = this.buildSmartKeyword(details);
        
        // [MOD] 一键注入磁力控制台模板
        wrapper.innerHTML = window.PornUIAssets.templates.magnetWidget(initKw);
        const kwInput = wrapper.querySelector('#jav-nong-kw'), table = wrapper.querySelector('#jav-nong-table'), btns = wrapper.querySelectorAll('#engine-btn-group .west-engine-btn');
        const getActiveEngine = () => wrapper.querySelector('#engine-btn-group .west-engine-btn.active').dataset.engine;

        // [MOD] 全局事件委托：一键监听所有“复制”按钮，省去循环绑定的内存消耗
        table.addEventListener('click', (e) => {
            const copyBtn = e.target.closest('.nong-copy');
            if (copyBtn) {
                e.preventDefault();
                const mag = copyBtn.dataset.mag;
                if (typeof GM_setClipboard !== 'undefined') GM_setClipboard(mag);
                else navigator.clipboard.writeText(mag);
                copyBtn.textContent = '已复制';
                setTimeout(() => copyBtn.textContent = '复制', 1500);
            }
        });

        wrapper.querySelector('#btn-pl-jump').onclick = () => { if (kwInput.value.trim()) window.open(`https://pornolab.net/forum/tracker.php?nm=${encodeURIComponent(kwInput.value.trim())}`, '_blank'); };
        wrapper.querySelector('#btn-copy-kw').onclick = function () { navigator.clipboard.writeText(kwInput.value.trim()); const o = this.textContent; this.textContent = '已复制'; this.style.backgroundColor = '#67c23a'; this.style.borderColor = '#67c23a'; setTimeout(() => { this.textContent = o; this.style.backgroundColor = ''; this.style.borderColor = ''; }, 1500); };
        btns.forEach(btn => { btn.onclick = (e) => { e.preventDefault(); btns.forEach(b => b.classList.remove('active')); btn.classList.add('active'); this.runSearch(table, kwInput.value.trim(), btn.dataset.engine, details); }; });

        const self = this;
        kwInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (this.value.trim() !== '') self.runSearch(table, this.value.trim(), getActiveEngine(), details); } });

        this.runSearch(table, initKw, 'BitSearch', details);
        return wrapper;
    }
};