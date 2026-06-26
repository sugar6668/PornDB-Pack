/**
 * @name         PornPack Drive API Library
 * @description  115 网盘底层通信与高级业务逻辑封装（含风控处理与 LRU 智能缓存）
 * @version      1.0.0
 */

window.PornDriveAPI = class PornDriveAPI {
    static API_115 = {
        sign: 'https://115.com/?ct=offline&ac=space',
        addTask: 'https://115.com/web/lixian/?ct=lixian&ac=add_task_url',
        fileList: 'https://webapi.115.com/files',
        fileAdd: 'https://webapi.115.com/files/add',
    };

    static dirCache = null;

    // --- 高频匹配缓冲池 ---
    static matchCache = new Map();
    static pendingDiskWrites = new Map();
    static cacheWriteTimer = null;

    // --- 基础通信与辅助工具 ---
    static tryJSON(r) { try { return JSON.parse(r.responseText); } catch { return null; } }
    static sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    static rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    static req115(method, url, data) {
        return new Promise((res, rej) => {
            const opts = { method, url, headers: { 'User-Agent': navigator.userAgent, 'Origin': 'https://115.com', 'Referer': 'https://115.com/' }, onload: r => res(r), onerror: e => rej(e) };
            if (data) { opts.data = data; opts.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'; }
            GM_xmlhttpRequest(opts);
        });
    }

    static async safeReq115(method, url, data = null, waitMin = 1200, waitMax = 2600) {
        await this.sleep(this.rand(waitMin, waitMax));
        return await this.req115(method, url, data);
    }

    // --- 离线风控与任务添加 ---
    static async get115Sign() {
        const j = this.tryJSON(await this.req115('GET', `${this.API_115.sign}&_=${Date.now()}`));
        if (!j || !j.sign) throw new Error('未获取到 115 离线授权。请确保已登录 115.com！');
        return { sign: j.sign, time: j.time, uid: j.uid || '' };
    }

    static async addOfflineTask(magnetUrl, cid) {
        const { sign, time, uid } = await this.get115Sign();
        const reqStr = new URLSearchParams({ url: magnetUrl, savepath: '', wp_path_id: String(cid), sign, time }).toString() + (uid ? `&uid=${uid}` : '');
        const j = this.tryJSON(await this.safeReq115('POST', this.API_115.addTask, reqStr, 1800, 3200));
        if (j && j.errcode === 911 && typeof Verify115 !== 'undefined') { Verify115.start(); throw new Error('触发115安全风控，请完成弹出的滑块验证！'); }
        if (!j || !j.state) throw new Error(j?.error_msg || '离线任务添加失败');
        return j;
    }

    // --- LRU 目录缓存管理 ---
    static initCache() {
        if (!this.dirCache && typeof GM_getValue !== 'undefined') {
            this.dirCache = GM_getValue('pdb_dir_cache_v2', {});
            // [MOD] 性能优化：将全盘垃圾遍历操作延迟 10 秒执行，把宝贵的首屏性能还给用户
            setTimeout(() => this.sweepOldWestCaches(), 10000);
        }
    }

    static saveDirCache() {
        const keys = Object.keys(this.dirCache);
        if (keys.length > 1000) {
            const sorted = keys.map(k => ({ key: k, ts: this.dirCache[k].ts || 0 })).sort((a, b) => b.ts - a.ts);
            const newCache = {};
            sorted.slice(0, 500).forEach(item => newCache[item.key] = this.dirCache[item.key]);
            this.dirCache = newCache;
            console.log("[PornDB-115] 目录缓存已达到上限，触发 LRU 清理，释放 500 条空间");
        }
        GM_setValue('pdb_dir_cache_v2', this.dirCache);
    }

    static async ensureDir(pid, name) {
        this.initCache();
        const key = `${pid}::${name}`;
        if (this.dirCache[key]) {
            this.dirCache[key].ts = Date.now(); this.saveDirCache(); return String(this.dirCache[key].cid);
        }
        const found = (this.tryJSON(await this.safeReq115('GET', `${this.API_115.fileList}?aid=1&cid=${pid}&limit=200&show_dir=1&offset=0`))?.data || []).find(f => f.n === name);
        if (found) {
            this.dirCache[key] = { cid: String(found.cid), ts: Date.now() }; this.saveDirCache(); return String(found.cid);
        }
        const j = this.tryJSON(await this.safeReq115('POST', this.API_115.fileAdd, new URLSearchParams({ pid: String(pid), cname: name }).toString(), 1800, 3200));
        if (!j || !j.cid) throw new Error('创建目录失败');
        this.dirCache[key] = { cid: String(j.cid), ts: Date.now() }; this.saveDirCache(); return String(j.cid);
    }

    // --- 获取真实中文目录路径 ---
    static fetchRealChinesePath(cid) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `https://webapi.115.com/files?aid=1&cid=${cid}&show_dir=1&limit=1&format=json`,
                responseType: "json",
                withCredentials: true,
                headers: { 'Origin': 'https://115.com', 'Referer': 'https://115.com/' },
                onload: (res) => {
                    try {
                        let data = res.response;
                        if (typeof data === 'string') data = JSON.parse(data);
                        else if (!data) data = JSON.parse(res.responseText);
                        resolve(data?.path?.map(x => x.name).filter(n => n && n !== '网盘').join('/') || '');
                    } catch (e) { resolve(''); }
                },
                onerror: () => resolve('')
            });
        });
    }

    // --- 影片匹配缓存读写中心 ---
    static getMatchCache(key) {
        if (this.matchCache.has(key)) return this.matchCache.get(key);
        try {
            const cache = GM_getValue('pdb_v4_' + key);
            if (!cache || !cache.ts || Date.now() - cache.ts > ((cache.data && cache.data.length) ? 2592000000 : 1800000)) {
                this.matchCache.set(key, null); // 记忆击穿
                return null;
            }
            this.matchCache.set(key, cache.data);
            return cache.data;
        } catch (e) {
            this.matchCache.set(key, null);
            return null;
        }
    }

    static setMatchCache(key, data) {
        this.matchCache.set(key, data);
        this.pendingDiskWrites.set('pdb_v4_' + key, { ts: Date.now(), data });
        // [MOD] 取消 1.5 秒的异步延迟写入，改为立即写入，防止小窗(iframe)提前关闭时导致内存数据未落盘而丢失
        if (this.cacheWriteTimer) clearTimeout(this.cacheWriteTimer);
        this.pendingDiskWrites.forEach((value, k) => GM_setValue(k, value));
        this.pendingDiskWrites.clear();
    }

    static deleteMatchCache(key) {
        this.matchCache.delete(key);
        this.pendingDiskWrites.delete('pdb_v4_' + key);
        GM_deleteValue('pdb_v4_' + key);
    }

    // --- 影片匹配缓存的垃圾回收 ---
    static sweepOldWestCaches() {
        try {
            const keys = GM_listValues().filter(k => k.startsWith('pdb_v4_'));
            const now = Date.now();
            let deletedCount = 0;
            keys.forEach(key => {
                const cache = GM_getValue(key);
                const maxAge = (cache && cache.data && cache.data.length) ? 2592000000 : 1800000;
                if (!cache || !cache.ts || now - cache.ts > maxAge) {
                    GM_deleteValue(key);
                    deletedCount++;
                }
            });
            if (deletedCount > 0) console.log(`[PornDB-115] 缓存清理: 成功销毁 ${deletedCount} 条过期影片数据`);
        } catch (e) { console.error("[PornDB-115] 缓存清理失败", e); }
    }
};