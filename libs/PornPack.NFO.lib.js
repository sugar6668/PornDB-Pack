/**
 * @name         PornPack NFO Generator Library
 * @description  生成标准的 NFO 元数据，支持本地下载与 115 云端直传
 * @version      1.0.0
 */

window.PornNFOGenerator = class PornNFOGenerator {
    static BTN_ID = 'export-nfo-btn';
    static checkedCid = null;
    static hasNFOInCloud = false;

    static init() {
        this.ensureButtonExists();
    }

    static ensureButtonExists() {
        if (!location.href.includes('/scenes/')) return;
        const subBtn = document.getElementById('search-subtitle-btn');
        const pbfBtn = document.getElementById('export-pbf-btn');
        const targetAnchor = subBtn || pbfBtn || document.getElementById('btn-copy-kw');

        if (targetAnchor && !document.getElementById(this.BTN_ID)) {
            this.createExportButton(targetAnchor);
            this.checkedCid = null;
        }

        const matchedBtn = document.querySelector('.x-match-btn-wide');
        const currentCid = matchedBtn ? matchedBtn.dataset.cid : null;
        if (currentCid && currentCid !== this.checkedCid) {
            this.checkedCid = currentCid;
            this.checkNFOInCloud(currentCid);
        }
    }

    static async checkNFOInCloud(cid) {
        const ReqClass = typeof window.Req115 !== 'undefined' ? window.Req115 : (typeof Req115 !== 'undefined' ? Req115 : null);
        if (!ReqClass) return;
        try {
            const res = await ReqClass.filesAll(cid);
            const hasNFO = res?.data?.some(f => f.n.toLowerCase().endsWith('.nfo'));
            this.hasNFOInCloud = !!hasNFO;
            this.updateButtonUI(this.hasNFOInCloud ? 'cloud_exists' : 'default');
        } catch (e) { }
    }

    static updateButtonUI(state) {
        const mainBtn = document.getElementById(this.BTN_ID);
        const dropOption = document.getElementById('nfo-drop-option');
        const dropBtn = mainBtn ? mainBtn.nextElementSibling : null;
        if (!mainBtn || !dropOption || !dropBtn) return;

        if (state === 'cloud_exists') {
            mainBtn.innerHTML = '已有 NFO';
            mainBtn.className = 'west-engine-btn pdb-bm-btn pdb-bm-main-btn pdb-bm-state-cloud';
            mainBtn.onclick = () => this.handleExport('cloud', mainBtn);
            dropBtn.className = 'west-engine-btn pdb-bm-btn pdb-bm-drop-btn pdb-bm-state-cloud';
            dropOption.innerHTML = '导出 NFO';
            dropOption.onclick = () => {
                document.getElementById('nfo-dropdown-menu').style.display = 'none';
                this.handleExport('local', mainBtn);
            };
        } else {
            mainBtn.innerHTML = '生成 NFO';
            mainBtn.className = 'west-engine-btn pdb-bm-btn pdb-bm-main-btn pdb-bm-state-local';
            mainBtn.onclick = () => this.handleExport('local', mainBtn);
            dropBtn.className = 'west-engine-btn pdb-bm-btn pdb-bm-drop-btn pdb-bm-state-local';
            dropOption.innerHTML = '直传 NFO';
            dropOption.onclick = () => {
                document.getElementById('nfo-dropdown-menu').style.display = 'none';
                this.handleExport('cloud', mainBtn);
            };
        }
    }

    static createExportButton(targetAnchor) {
        const wrapper = document.createElement('div');
        wrapper.className = 'pdb-bm-wrapper';
        wrapper.style.marginLeft = '4px';

        const mainBtn = document.createElement('button');
        mainBtn.id = this.BTN_ID;

        const dropBtn = document.createElement('button');
        dropBtn.innerHTML = window.PornUIAssets.icons.dropArrow;

        const menu = document.createElement('div');
        menu.id = 'nfo-dropdown-menu';
        menu.className = 'pdb-bm-menu';

        const uploadOption = document.createElement('div');
        uploadOption.id = 'nfo-drop-option';
        uploadOption.className = 'pdb-bm-option';

        menu.appendChild(uploadOption);
        wrapper.appendChild(mainBtn);
        wrapper.appendChild(dropBtn);
        wrapper.appendChild(menu);
        targetAnchor.insertAdjacentElement('afterend', wrapper);

        dropBtn.onclick = (e) => {
            e.stopPropagation();
            menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        };
        document.addEventListener('click', () => menu.style.display = 'none');

        this.hasNFOInCloud = false;
        this.updateButtonUI('default');
    }

    static generateXML(details) {
        // XML 转义函数
        const esc = (s) => (s || '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' }[c]));
        // CDATA 包装函数 (避免内部 HTML 或特殊字符干扰)
        const cdata = (s) => `<![CDATA[${s || ''}]]>`;

        const yearMatch = details.dateStr ? details.dateStr.split('.')[0] : '';
        const year = yearMatch ? `20${yearMatch}` : '';
        const dateFormatted = details.dateStr ? `20${details.dateStr.replace(/\./g, '-')}` : '';
        const num = details.matchPrefix || '';
        const title = details.fullTitle || details.titlePart || '';
        const originalTitle = details.titlePart || details.fullTitle || '';
        const maker = details.maker || '';

        // 构建并合并智能标签池 (自动去重)
        let tagsSet = new Set(details.tags || []);
        if (maker) {
            tagsSet.add(maker);
            tagsSet.add(`系列: ${maker}`);
            tagsSet.add(`片商: ${maker}`);
            tagsSet.add(`发行: ${maker}`);
        }
        (details.actors || []).forEach(a => tagsSet.add(a));
        tagsSet.add('中文字幕');
        tagsSet.add('无码');
        const tags = Array.from(tagsSet);

        // 严格对齐标准 NFO 模板拼接 XML
        let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<movie>\n`;

        if (details.plot) {
            xml += `  <plot>${cdata(details.plot)}</plot>\n`;
            xml += `  <outline>${cdata(details.plot)}</outline>\n`;
            xml += `  <originalplot>${cdata(details.plot)}</originalplot>\n`;
        }

        if (dateFormatted) {
            xml += `  <tagline>发行日期 ${dateFormatted}</tagline>\n`;
            xml += `  <premiered>${dateFormatted}</premiered>\n`;
            xml += `  <releasedate>${dateFormatted}</releasedate>\n`;
            xml += `  <release>${dateFormatted}</release>\n`;
        }

        if (num) xml += `  <num>${esc(num)}</num>\n`;
        xml += `  <title>${esc(title)}</title>\n`;
        xml += `  <originaltitle>${esc(originalTitle)}</originaltitle>\n`;
        xml += `  <sorttitle>${esc(title)}</sorttitle>\n`;
        xml += `  <mpaa>NC-17</mpaa>\n`;
        xml += `  <customrating>NC-17</customrating>\n`;
        xml += `  <countrycode>US</countrycode>\n`;

        let actors = (details.actors && details.actors.length > 0) ? details.actors : (details.actor && details.actor !== 'Unknown_Actor' ? [details.actor] : []);
        actors.forEach(a => {
            xml += `  <actor>\n    <name>${esc(a)}</name>\n    <type>Actor</type>\n  </actor>\n`;
        });

        // 增加导演节点
        if (details.director) xml += `  <director>${esc(details.director)}</director>\n`;

        if (year) xml += `  <year>${year}</year>\n`;
        if (details.runtime) xml += `  <runtime>${esc(details.runtime)}</runtime>\n`;

        if (maker) {
            xml += `  <set>\n    <name>${esc(maker)}</name>\n  </set>\n`;
            xml += `  <series>${esc(maker)}</series>\n`;
            xml += `  <studio>${esc(maker)}</studio>\n`;
            xml += `  <maker>${esc(maker)}</maker>\n`;
            xml += `  <publisher>${esc(maker)}</publisher>\n`;
            xml += `  <label>${esc(maker)}</label>\n`;
        }

        tags.forEach(t => xml += `  <tag>${esc(t)}</tag>\n`);
        tags.forEach(t => xml += `  <genre>${esc(t)}</genre>\n`);

        if (details.coverUrl) {
            xml += `  <poster>${esc(details.coverUrl)}</poster>\n`;
            xml += `  <cover>${esc(details.coverUrl)}</cover>\n`;
            xml += `  <thumb>${esc(details.coverUrl)}</thumb>\n`;
        }

        if (details.url) {
            xml += `  <theporndbid>${esc(details.url)}</theporndbid>\n`;
        }

        xml += `</movie>`;
        return xml;
    }

    static createNFOFile(content, filename) {
        // NFO 需要标准的 UTF-8 编码，无需像书签那样强制加 BOM 头
        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(content);
        const blob = new Blob([uint8Array], { type: 'application/xml' });
        return new File([blob], filename, { type: 'application/xml' });
    }

    static async handleExport(mode = 'local', btnNode) {
        const details = document.WESTDETAILS;
        if (!details || !details.isValid) return alert("页面元数据尚未加载完毕，请稍后再试！");

        const xmlContent = this.generateXML(details);
        // 复用 Bookmark 的标准文件名机制以确保 100% 同名刮削
        const finalName = window.PornBookmark ? window.PornBookmark.getStandardizedFilename() : document.title.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, ' ').trim();
        const fileName = `${finalName}.nfo`;

        if (mode === 'local') {
            const fileObj = this.createNFOFile(xmlContent, fileName);
            const link = document.createElement('a');
            link.href = URL.createObjectURL(fileObj);
            link.download = fileName;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

            // 复用按钮临时状态提醒
            if (window.PornBookmark) window.PornBookmark.setTempBtnState(btnNode, '生成 NFO', '已下载本地', '#67c23a');
        } else if (mode === 'cloud') {
            const matchedBtn = document.querySelector('.x-match-btn-wide');
            const targetCid = matchedBtn ? matchedBtn.dataset.cid : null;
            const ReqClass = typeof window.Req115 !== 'undefined' ? window.Req115 : (typeof Req115 !== 'undefined' ? Req115 : null);

            if (targetCid && ReqClass) {
                btnNode.innerHTML = '正在直传...';
                try {
                    const fileObj = this.createNFOFile(xmlContent, fileName);
                    const initRes = await ReqClass.sampleInitUpload({ filename: fileName, filesize: fileObj.size, cid: targetCid });

                    if (initRes && (initRes.host || initRes.status === 2 || initRes.statuscode === 0)) {
                        if (initRes.host) {
                            let uploadRes = null;
                            for (let retry = 0; retry < 3; retry++) {
                                uploadRes = await ReqClass.upload({ ...initRes, filename: fileName, file: fileObj });
                                if (uploadRes && uploadRes.state !== false) break;
                                await new Promise(r => setTimeout(r, 1500));
                            }
                            if (uploadRes && uploadRes.state === false) throw new Error(uploadRes.error_msg || uploadRes.error || "115 服务器拒绝接收回调");
                        }
                        this.hasNFOInCloud = true;
                        this.updateButtonUI('cloud_exists');
                        if (window.PornBookmark) window.PornBookmark.setTempBtnState(btnNode, '生成 NFO', '直传成功', '#67c23a');
                    } else {
                        throw new Error(initRes?.error_msg || "获取115上传凭证失败");
                    }
                } catch (e) {
                    console.error("[PornNFO] 上传失败:", e);
                    alert("NFO 直传网盘失败: " + e.message);
                    if (window.PornBookmark) window.PornBookmark.setTempBtnState(btnNode, '生成 NFO', '直传失败', '#f56c6c');
                }
            } else {
                alert("无法直传：请先等待界面匹配出 115 影片归档目录！");
                if (window.PornBookmark) window.PornBookmark.setTempBtnState(btnNode, '生成 NFO', '无目标目录', '#e6a23c');
            }
        }
    }
};