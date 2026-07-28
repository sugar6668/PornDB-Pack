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
    // v5 stores an explicit resolved state so misses remain durable too.
    static MATCH_STATE_PREFIX = 'pdb_match_state_v5_';
    static LEGACY_MATCH_PREFIX = 'pdb_v4_';
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
            // Match-state migration is lazy per key; do not scan all match records on startup.
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
    // --- Persistent match-state store (v5) ---
    static matchStateKey(key) { return this.MATCH_STATE_PREFIX + String(key || '').trim(); }
    static legacyMatchKey(key) { return this.LEGACY_MATCH_PREFIX + String(key || '').trim(); }

    static isValidMatchState(value) {
        return value
            && (value.status === 'matched' || value.status === 'unmatched')
            && Array.isArray(value.data)
            && Number.isFinite(value.revision);
    }

    static readMatchState(key) {
        const normalizedKey = String(key || '').trim();
        if (!normalizedKey) return null;
        if (this.matchCache.has(normalizedKey)) return this.matchCache.get(normalizedKey);

        try {
            const current = GM_getValue(this.matchStateKey(normalizedKey));
            if (this.isValidMatchState(current)) {
                this.matchCache.set(normalizedKey, current);
                return current;
            }

            // Lazy migration preserves old hit and miss records without a startup-wide GM_listValues scan.
            const legacy = GM_getValue(this.legacyMatchKey(normalizedKey));
            if (legacy && Array.isArray(legacy.data)) {
                const migrated = {
                    v: 5,
                    status: legacy.data.length ? 'matched' : 'unmatched',
                    data: legacy.data,
                    revision: 1,
                    updatedAt: legacy.ts || Date.now(),
                    source: 'legacy',
                    needsResolve: false,
                };
                GM_setValue(this.matchStateKey(normalizedKey), migrated);
                this.matchCache.set(normalizedKey, migrated);
                return migrated;
            }
        } catch (e) { console.warn('[PornDB-115] read match state failed', e); }

        this.matchCache.set(normalizedKey, null);
        return null;
    }

    static getMatchState(key) { return this.readMatchState(key); }

    static commitMatchState(key, patch = {}) {
        const normalizedKey = String(key || '').trim();
        if (!normalizedKey) return { committed: false, state: null };
        const previous = this.readMatchState(normalizedKey);
        const expectedRevision = patch.expectedRevision;
        const previousRevision = previous?.revision || 0;
        if (expectedRevision !== undefined && expectedRevision !== previousRevision) {
            return { committed: false, state: previous };
        }

        const data = Array.isArray(patch.data) ? patch.data : (previous?.data || []);
        const status = patch.status || (data.length ? 'matched' : 'unmatched');
        const state = {
            v: 5,
            status,
            data,
            revision: previousRevision + 1,
            updatedAt: Date.now(),
            source: patch.source || previous?.source || 'search',
            needsResolve: patch.needsResolve === undefined ? !!previous?.needsResolve : !!patch.needsResolve,
        };
        this.matchCache.set(normalizedKey, state);
        GM_setValue(this.matchStateKey(normalizedKey), state);
        return { committed: true, state };
    }

    static setMatchState(key, data, source = 'search', options = {}) {
        return this.commitMatchState(key, {
            data: Array.isArray(data) ? data : [],
            status: options.status || (data?.length ? 'matched' : 'unmatched'),
            source,
            needsResolve: options.needsResolve ?? false,
            expectedRevision: options.expectedRevision,
        });
    }

    static markMatchNeedsResolve(key, source = 'offline') {
        const previous = this.readMatchState(key);
        return this.commitMatchState(key, {
            data: previous?.data || [],
            status: previous?.status || 'unmatched',
            source,
            needsResolve: true,
        });
    }

    static clearMatchStateMemory(key) {
        this.matchCache.delete(String(key || '').trim());
    }

    // Compatibility wrapper for callers that only need the matched video list.
    static getMatchCache(key) { return this.readMatchState(key)?.data ?? null; }
    static setMatchCache(key, data, source = 'search', options = {}) { return this.setMatchState(key, data, source, options).state; }

    static deleteMatchCache(key) {
        const normalizedKey = String(key || '').trim();
        this.matchCache.delete(normalizedKey);
        this.pendingDiskWrites.delete(this.matchStateKey(normalizedKey));
        GM_deleteValue(this.matchStateKey(normalizedKey));
    }

    // Retained for API compatibility. v5 has no TTL and no full-cache sweep.
    static sweepOldWestCaches() { }

};
