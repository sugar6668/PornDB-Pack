/**
 * @name         PornPack Magnet Search Library
 * @description  多引擎磁力链接搜索与数据解析模块
 * @version      1.0.0
 */

class MagnetSearcher {
    /**
     * @param {Function} fetcher - 跨域请求函数，需返回包含 loadstuts 和 responseText 的 Promise
     */
    constructor(fetcher) {
        if (typeof fetcher !== 'function') {
            throw new Error('MagnetSearcher 需要一个 fetcher 函数作为参数 (例如 gmFetch)');
        }
        this.fetch = fetcher;
    }

    /**
     * 统一搜索入口
     * @param {string} engineName - 引擎名称 ('BTDigg' | 'PirateBay' | 'BitSearch')
     * @param {string} kw - 搜索关键词
     */
    async search(engineName, kw) {
        if (!kw) return [];
        switch (engineName) {
            case 'BTDigg':
                return await this.searchBTDigg(kw);
            case 'PirateBay':
                return await this.searchPirateBay(kw);
            case 'BitSearch':
                return await this.searchBitSearch(kw);
            default:
                throw new Error(`不支持的搜索引擎: ${engineName}`);
        }
    }

    // ==========================================
    // 引擎 1：BTDigg
    // ==========================================
    async searchBTDigg(kw) {
        const r = await this.fetch(`https://btdig.com/search?q=${encodeURIComponent(kw)}`);
        if (!r.loadstuts) return [];
        
        const doc = new DOMParser().parseFromString(r.responseText, 'text/html');
        return [...doc.querySelectorAll('div.one_result')].map(el => {
            const files = el.querySelector('.torrent_files')?.textContent?.trim() || '';
            const size = el.querySelector('.torrent_size')?.textContent?.replace(/&nbsp;/g, ' ')?.trim() || '';
            const age = el.querySelector('.torrent_age')?.textContent?.trim() || '';

            let excerptHtml = '';
            const excerptNode = el.querySelector('.torrent_excerpt');
            if (excerptNode) {
                let inner = excerptNode.innerHTML || '';
                excerptHtml = `<div style="margin-top: 8px; padding: 8px 10px; background: #fafafa; border: 1px solid #ebeef5; border-radius: 4px; font-size: 11.5px; color: #606266; max-height: 120px; overflow-y: auto; word-break: break-all; line-height: 1.6;">
                    ${inner.replace(/white-space:\s*nowrap/ig, 'white-space: normal')}
                </div>`;
            }

            const extraHtml = `<div style="font-size:11.5px; margin-top:6px; display:inline-flex; gap:12px; background:#f4f4f5; padding:4px 10px; border-radius:4px; border:1px solid #e4e7ed;">
                ${age ? `<span style="color:#606266; font-weight:bold;" title="Age">时间 ${age}</span>` : ''}
                ${files ? `<span style="color:#198754; font-weight:bold;" title="Files">文件 ${files.replace('files', '文件')}</span>` : ''}
                ${size ? `<span style="color:#0dcaf0; font-weight:bold;" title="Size">大小 ${size}</span>` : ''}
            </div>${excerptHtml}`;

            return {
                title: el.querySelector('.torrent_name a')?.textContent?.trim(),
                maglink: el.querySelector('.fa.fa-magnet a')?.href,
                size: size,
                extraHtml: extraHtml,
                src: el.querySelector('.torrent_name a')?.href,
            };
        });
    }

    // ==========================================
    // 引擎 2：PirateBay (通过 API)
    // ==========================================
    async searchPirateBay(kw) {
        const r = await this.fetch(`https://apibay.org/q.php?q=${encodeURIComponent(kw)}&cat=500`);
        if (!r.loadstuts) return [];
        
        try {
            const json = JSON.parse(r.responseText);
            if (json[0] && json[0].id === "0") return [];
            
            return json.map(item => {
                const sizeMB = parseInt(item.size) / (1024 * 1024);
                const sizeStr = sizeMB > 1024 ? (sizeMB / 1024).toFixed(2) + ' GB' : sizeMB.toFixed(2) + ' MB';

                const date = new Date(parseInt(item.added) * 1000);
                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

                const extraHtml = `<div style="font-size:11.5px; margin-top:6px; display:inline-flex; gap:12px; background:#f4f4f5; padding:4px 10px; border-radius:4px; border:1px solid #e4e7ed;">
                    <span style="color:#606266; font-weight:bold;" title="收录时间">时间 ${dateStr}</span>
                    ${item.num_files && item.num_files !== '0' ? `<span style="color:#198754; font-weight:bold;" title="文件数">文件 ${item.num_files} 文件</span>` : ''}
                    <span style="color:#198754; font-weight:bold;" title="做种数(Seeders)">做种 ${item.seeders}</span>
                    <span style="color:#dc3545; font-weight:bold;" title="下载数(Leechers)">下载 ${item.leechers}</span>
                    ${item.username && item.username !== 'Anonymous' ? `<span style="color:#888; font-weight:bold;" title="上传者">上传者 ${item.username}</span>` : ''}
                </div>`;

                return {
                    title: item.name,
                    maglink: `magnet:?xt=urn:btih:${item.info_hash}`,
                    size: sizeStr,
                    extraHtml: extraHtml,
                    src: `https://thepiratebay.org/description.php?id=${item.id}`
                };
            });
        } catch (e) { 
            return []; 
        }
    }

    // ==========================================
    // 引擎 3：BitSearch
    // ==========================================
    async searchBitSearch(kw) {
        const r = await this.fetch(`https://bitsearch.eu/search?q=${encodeURIComponent(kw)}`);
        if (!r.loadstuts) return [];
        
        const doc = new DOMParser().parseFromString(r.responseText, 'text/html');
        return [...doc.querySelectorAll('div.bg-white.rounded-lg.shadow-sm')].map(el => {
            const titleNode = el.querySelector('h3 a');
            const magnetNode = el.querySelector('a[href^="magnet:"]');

            const spans = el.querySelectorAll('.inline-flex span');
            let sizeInfo = '未知大小', dateStr = '未知日期';
            let seeders = '0', leechers = '0', downloads = '0';

            spans.forEach(span => {
                const txt = span.textContent.trim().toLowerCase();
                const fullText = span.parentElement.textContent.trim().toLowerCase();

                if (txt.match(/gb|mb|kb/)) sizeInfo = span.textContent.trim();
                if (fullText.includes('seeders') && txt.match(/^\d+$/)) seeders = span.textContent.trim();
                if (fullText.includes('leechers') && txt.match(/^\d+$/)) leechers = span.textContent.trim();
                if (fullText.includes('downloads') && txt.match(/^\d+$/)) downloads = span.textContent.trim();
                if (txt.match(/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/)) dateStr = span.textContent.trim();
            });

            const extraHtml = `
                <div style="font-size:11.5px; margin-top:6px; display:inline-flex; gap:12px; background:#f4f4f5; padding:4px 10px; border-radius:4px; border:1px solid #e4e7ed;">
                    <span style="color:#606266; font-weight:bold;">添加日期: ${dateStr}</span>
                    <span style="color:#198754; font-weight:bold;" title="做种数(Seeders)">做种: ${seeders}</span>
                    <span style="color:#dc3545; font-weight:bold;" title="下载中(Leechers)">下载中: ${leechers}</span>
                    <span style="color:#0dcaf0; font-weight:bold;" title="已完成下载(Downloads)">已完成: ${downloads}</span>
                </div>`;

            return {
                title: titleNode?.textContent?.trim() || '',
                maglink: magnetNode?.href || '',
                size: sizeInfo,
                extraHtml: extraHtml,
                src: titleNode ? `https://bitsearch.eu${titleNode.getAttribute('href')}` : ''
            };
        }).filter(item => item.maglink);
    }
}

// 挂载到全局 Window 对象，方便主脚本调用
window.PornMagnetSearch = MagnetSearcher;