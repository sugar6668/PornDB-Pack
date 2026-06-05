/**
 * @name         PornPack Archiver Library
 * @description  融合 JavDB 同步快跑模式与智能刮削清理核心
 * @version      1.0.2
 */

window.PornArchiver = class PornArchiver {
    constructor(options) {
        this.safeReq115 = options.safeReq115;
        this.req115 = options.req115; 
        this.updateBtnUI = options.updateBtnUI;
        this.sleep = options.sleep;
        this.rand = options.rand;
        this.triggerAutoMatch = options.triggerAutoMatch; 

        this.API_115 = {
            taskList: 'https://115.com/web/lixian/?ct=lixian&ac=task_lists',
            fileList: 'https://webapi.115.com/files',
            fileEdit: 'https://webapi.115.com/files/edit',
            fileMove: 'https://webapi.115.com/files/move',
        };

        this.LOW_RISK_CONFIG = {
            taskPollMin: 20000, taskPollMax: 35000, dirPollMin: 35000, dirPollMax: 60000,
            stepGapMin: 1500, stepGapMax: 2500, maxRetry: 35, 
            enableAutoDelete: true, enableAutoCover: true, enableAutoRematch: false
        };

        this.renameQ = typeof GM_getValue !== 'undefined' ? GM_getValue('pdb_rename_q', []) : [];
        this.pollTimer = null;
        this.pollBusy = false;
    }

    tryJSON(r) { try { return JSON.parse(r.responseText); } catch { return null; } }
    
    async fastReq115(method, url, data = null) {
        await this.sleep(this.rand(800, 1500));
        return await this.req115(method, url, data);
    }

    saveQ() { if (typeof GM_setValue !== 'undefined') GM_setValue('pdb_rename_q', this.renameQ); }
    getQueue() { return this.renameQ; }

    async addTask(task) {
        const finished = await this.fastExecute(task);
        if (!finished) {
            this.renameQ.push(task);
            this.saveQ();
            if (this.updateBtnUI) this.updateBtnUI(task.hash, '🕒 转后台排队', '#28a745');
            this.scheduleNextPoll(15000, 25000);
        }
    }

    async fastExecute(item) {
        let isDownloaded = false;
        let targetItems = [];

        for (let i = 0; i < 12; i++) {
            if (this.updateBtnUI) this.updateBtnUI(item.hash, `⏳ 验证进度(${i+1})...`, '#f39c12');
            await this.sleep(this.rand(1500, 2000));
            
            const taskRes = this.tryJSON(await this.fastReq115('GET', `${this.API_115.taskList}&page=1`, null));
            const activeTask = (taskRes?.tasks || []).find(t => t.info_hash && t.info_hash.toLowerCase() === item.hash.toLowerCase());

            if (activeTask) {
                if (activeTask.status === -1) {
                    if (this.updateBtnUI) this.updateBtnUI(item.hash, '❌ 离线报错', '#dc3545');
                    return true;
                }
                if (activeTask.status === 2) {
                    isDownloaded = true;
                    if (activeTask.file_id) {
                        targetItems.push({ fid: '', cid: String(activeTask.file_id), n: activeTask.name || item.newName });
                    }
                    break;
                }
                if (this.updateBtnUI) this.updateBtnUI(item.hash, `⬇️ 下载 ${Math.floor(activeTask.percent)}%`, '#f39c12');
            } else {
                isDownloaded = true;
                break;
            }
        }

        if (!isDownloaded && targetItems.length === 0) return false;

        if (targetItems.length === 0) {
            if (this.updateBtnUI) this.updateBtnUI(item.hash, '⏳ 扫描目录...', '#f39c12');
            const r = await this.fastReq115('GET', `${this.API_115.fileList}?aid=1&cid=${item.cid}&limit=500&show_dir=1&offset=0`, null);
            const allDirItems = this.tryJSON(r)?.data || [];
            
            const hashLower = String(item.hash || '').toLowerCase();
            const rawTitle = String(item.rawTitle || '').toLowerCase().substring(0, 15);
            
            targetItems = allDirItems.filter(f => {
                const raw = String(f.n || '').toLowerCase();
                if (hashLower && raw.includes(hashLower)) return true;
                if (rawTitle && raw.includes(rawTitle)) return true;
                return (window.PornMatcher && window.PornMatcher.getOfflineRescueScore(raw, item) >= 120);
            });
        }

        if (targetItems.length > 0) {
            if (this.updateBtnUI) this.updateBtnUI(item.hash, '⚙️ 刮削清理中...', '#f39c12');
            const success = await this.processTargetItems(targetItems, item);
            if (success) {
                if (this.updateBtnUI) this.updateBtnUI(item.hash, '🎉 刮削完成', '#8e44ad');
                if (this.LOW_RISK_CONFIG.enableAutoRematch && this.triggerAutoMatch) setTimeout(() => this.triggerAutoMatch(), this.rand(2000, 4000));
                return true;
            }
        }
        return false;
    }

    async processTargetItems(targetItems, item) {
        let isSuccess = false;
        const zhRegex = /chs|cht|sub|中字|字幕|-c|_c/i;

        for (const target of targetItems) {
            if (!target.fid && target.cid) {
                const sr = await this.fastReq115('GET', `${this.API_115.fileList}?aid=1&cid=${target.cid}&limit=1000&show_dir=1&offset=0`, null);
                const subFiles = this.tryJSON(sr)?.data || [];
                let vids = subFiles.filter(f => f.ico === 'video' || /\.(mp4|mkv|avi|wmv|ts|iso)$/i.test(f.n || ''));
                let subs = subFiles.filter(f => /\.(srt|ass|ssa|vtt|stl)$/i.test(f.n || ''));

                if (vids.filter(v => v.s > 100 * 1024 * 1024).length === 0) {
                    const innerFolders = subFiles.filter(f => !f.fid && f.cid);
                    if (innerFolders.length > 0) {
                        const deepSr = await this.fastReq115('GET', `${this.API_115.fileList}?aid=1&cid=${innerFolders[0].cid}&limit=1000&show_dir=1&offset=0`, null);
                        const deepFiles = this.tryJSON(deepSr)?.data || [];
                        vids.push(...deepFiles.filter(f => f.ico === 'video' || /\.(mp4|mkv|avi|wmv|ts|iso)$/i.test(f.n || '')).map(v => ({...v, isDeep: true})));
                        subs.push(...deepFiles.filter(f => /\.(srt|ass|ssa|vtt|stl)$/i.test(f.n || '')).map(s => ({...s, isDeep: true})));
                    }
                }

                let validVids = vids.filter(v => (v.s || 0) > 100 * 1024 * 1024);

                if (validVids.length > 0) {
                    validVids.sort((a, b) => a.n.localeCompare(b.n));
                    subs.sort((a, b) => a.n.localeCompare(b.n));

                    const hasZh = validVids.some(v => zhRegex.test(v.n)) || subs.length > 0 || subFiles.some(f => zhRegex.test(f.n));
                    const chineseTag = hasZh ? " 中文" : "";

                    const finalDirArray = Array.isArray(item.finalDirArray) && item.finalDirArray.length ? item.finalDirArray : ['欧美演员', '未知演员', item.newName];
                    const finalCid = await this.req115.handleDir(finalDirArray);
                    
                    for (let i = 0; i < validVids.length; i++) {
                        const vid = validVids[i];
                        const ext = (vid.n.match(/(\.[a-zA-Z0-9]{2,4})$/) || ['', '.mp4'])[1];
                        const suffix = validVids.length > 1 ? `-${String.fromCharCode(65 + i)}` : ''; 
                        const finalName = `${item.newName}${suffix}${chineseTag}${ext}`;

                        const moveData = new URLSearchParams(); moveData.append('pid', String(finalCid)); moveData.append('fid[0]', String(vid.fid));
                        await this.fastReq115('POST', this.API_115.fileMove, moveData.toString());
                        await this.fastReq115('POST', this.API_115.fileEdit, new URLSearchParams({ fid: String(vid.fid), file_name: finalName }).toString());
                    }

                    for (let i = 0; i < subs.length; i++) {
                        const sub = subs[i];
                        let extMatch = sub.n.match(/(\.[a-zA-Z0-9_-]+\.(srt|ass|ssa|vtt|stl)$)/i) || sub.n.match(/(\.(srt|ass|ssa|vtt|stl)$)/i);
                        const ext = extMatch ? extMatch[0] : '.srt';
                        const suffix = validVids.length > 1 && i < validVids.length ? `-${String.fromCharCode(65 + i)}` : (subs.length > 1 ? `-${i+1}` : '');
                        const finalName = `${item.newName}${suffix}${chineseTag}${ext}`;

                        const moveData = new URLSearchParams(); moveData.append('pid', String(finalCid)); moveData.append('fid[0]', String(sub.fid));
                        await this.fastReq115('POST', this.API_115.fileMove, moveData.toString());
                        await this.fastReq115('POST', this.API_115.fileEdit, new URLSearchParams({ fid: String(sub.fid), file_name: finalName }).toString());
                    }

                    if (this.LOW_RISK_CONFIG.enableAutoDelete) {
                        try {
                            const sourceRes = await this.req115.filesAll(target.cid);
                            const remaining = (sourceRes?.data || []).filter(f => (/\.(mp4|mkv|avi|wmv|ts)$/i.test(f.n) || f.ico === 'video') && f.s > 100 * 1024 * 1024);
                            if (remaining.length === 0) await this.req115.rbDelete([target.cid], item.cid);
                        } catch(e) {}
                    }

                    if (this.LOW_RISK_CONFIG.enableAutoCover && this.req115 && item.coverUrl) {
                        try {
                            const coverRes = await this.req115.handleCover(item.coverUrl, finalCid, item.coverName || 'cover.jpg');
                            const fileId = coverRes?.data?.fileid || coverRes?.data?.file_id;
                            if (fileId) { await this.sleep(1500); await this.req115.filesEdit(finalCid, fileId); }
                        } catch (e) {}
                    }
                    isSuccess = true; break;
                }
            }
            else if (target.fid && (target.ico === 'video' || /\.(mp4|mkv|avi)$/i.test(target.n || ''))) {
                if (target.s > 100 * 1024 * 1024) {
                    const chineseTag = zhRegex.test(target.n) ? " 中文" : "";
                    const ext = (target.n.match(/(\.[a-zA-Z0-9]{2,4})$/) || ['', '.mp4'])[1];
                    const finalDirArray = Array.isArray(item.finalDirArray) && item.finalDirArray.length ? item.finalDirArray : ['欧美演员', '未知演员', item.newName];
                    const finalCid = await this.req115.handleDir(finalDirArray);

                    const moveData = new URLSearchParams(); moveData.append('pid', String(finalCid)); moveData.append('fid[0]', String(target.fid));
                    await this.fastReq115('POST', this.API_115.fileMove, moveData.toString());
                    await this.fastReq115('POST', this.API_115.fileEdit, new URLSearchParams({ fid: String(target.fid), file_name: `${item.newName}${chineseTag}${ext}` }).toString());

                    if (this.LOW_RISK_CONFIG.enableAutoCover && this.req115 && item.coverUrl) {
                        try {
                            const coverRes = await this.req115.handleCover(item.coverUrl, finalCid, item.coverName || 'cover.jpg');
                            if (coverRes?.data?.fileid) { await this.sleep(1500); await this.req115.filesEdit(finalCid, coverRes.data.fileid); }
                        } catch (e) {}
                    }
                    isSuccess = true; break;
                }
            }
        }
        return isSuccess;
    }

    scheduleNextPoll(min, max) {
        if (this.pollTimer) clearTimeout(this.pollTimer);
        if (!this.renameQ.length) return;
        this.pollTimer = setTimeout(() => { this.pollRenameQueue(); }, this.rand(min, max));
    }
    
    markQueueError(item, msg) {
        item.failCount = (item.failCount || 0) + 1; this.saveQ();
        if (this.updateBtnUI) this.updateBtnUI(item.hash, `⚠️ ${msg}`, '#d35400');
    }

    async pollRenameQueue() {
        if (this.pollBusy || !this.renameQ.length) return;
        this.pollBusy = true;
        try {
            const item = this.renameQ[0];
            item.retryCount = (item.retryCount || 0) + 1; this.saveQ();
            
            if (item.retryCount > this.LOW_RISK_CONFIG.maxRetry) {
                this.markQueueError(item, '轮询超时'); this.pollBusy = false; 
                this.scheduleNextPoll(this.LOW_RISK_CONFIG.dirPollMin, this.LOW_RISK_CONFIG.dirPollMax); return;
            }
            const finished = await this.fastExecute(item);
            if (finished) {
                this.renameQ.splice(0, 1); this.saveQ();
            }
        } catch(e) {}
        this.pollBusy = false;
        this.scheduleNextPoll(this.LOW_RISK_CONFIG.dirPollMin, this.LOW_RISK_CONFIG.dirPollMax);
    }

    async tryRescueFromDefaultOfflineDir(item) {
        if (!item || !item.cid) return false;
        try {
            const searchR = await this.safeReq115('GET', `${this.API_115.fileList}?aid=1&cid=0&limit=100&show_dir=1&offset=0&o=user_utime&asc=0`, null, 1200, 2200);
            const tryJSON = r => { try { return JSON.parse(r.responseText); } catch { return null; } };
            const defaultItems = tryJSON(searchR)?.data || [];
            if (!defaultItems.length) return false;

            const nowSec = Date.now() / 1000;
            const freshItems = defaultItems.filter(f => { const t = Number(f.te || f.t || 0); return t === 0 || t >= nowSec - 15 * 60; });
            if (!freshItems.length) return false;

            const candidate = freshItems.map((f) => {
                const rawName = String(f.n || '').toLowerCase();
                let score = window.PornMatcher ? window.PornMatcher.getOfflineRescueScore(rawName, item) : 0;
                const hashLower = String(item.hash || '').toLowerCase();
                if (hashLower && rawName.includes(hashLower)) score += 300;
                return { ...f, _score: score };
            }).filter(f => f._score >= 120).sort((a, b) => b._score - a._score)[0];

            if (!candidate) return false;
            const moveId = candidate.fid || candidate.cid;
            if (!moveId) return false;

            const moveData = new URLSearchParams();
            moveData.append('pid', String(item.cid)); moveData.append('fid[0]', String(moveId));
            await this.safeReq115('POST', this.API_115.fileMove, moveData.toString(), 1500, 2600);
            return true;
        } catch (e) { return false; }
    }

    async cleanupOfflineSourceDirByBigVideo(sourceCid, parentCid, movedFids = [], sizeThresholdMB = 100) {
        if (!this.req115 || !sourceCid) return false;
        try {
            const sourceRes = await this.req115.filesAll(sourceCid);
            const sourceItems = sourceRes?.data || [];
            const movedSet = new Set((movedFids || []).map(String));
            const sizeThreshold = sizeThresholdMB * 1024 * 1024;

            const remainingBigVideos = sourceItems.filter((f) => {
                if (f.fid && movedSet.has(String(f.fid))) return false;
                const name = String(f.n || '').toLowerCase();
                const size = Number(f.s || f.size || 0);
                return (/\.(mp4|mkv|avi|wmv|ts|flv|rmvb|m2ts|iso|mov)$/i.test(name) || f.ico === 'video') && size > sizeThreshold;
            });

            if (remainingBigVideos.length === 0) {
                try { await this.req115.rbDelete([sourceCid], parentCid); } catch(err) { }
                return true;
            }
            return false;
        } catch (e) { return false; }
    }

    /**
     * 智能刮削归档核心
     */
    async flattenAfterOffline(details, dirArray) {
        const req = this.req115;
        if (!req) return;

        const targetCid = await req.handleDir(dirArray); 
        if (!targetCid) throw new Error("无法创建或获取目标目录");

        const safeSearchKw = (kw) => (kw || '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, ' ').replace(/\s+/g, ' ').trim();

        let searchRes = null;
        let videos = [];
        let video = null;

        try {
            let kw1 = safeSearchKw(details.matchPrefix).substring(0, 40);
            searchRes = await req.filesSearchAllVideos(kw1);
            videos = window.PornMatcher ? window.PornMatcher.getMatchedVideos(searchRes?.data || [], details) : [];
            video = videos[0];
        } catch (e) {}

        if (!video && details.titleKeyword) {
            try {
                let kw2 = safeSearchKw(details.titleKeyword).substring(0, 40);
                let fbSearch = await req.filesSearchAllVideos(kw2);
                let fbVideos = window.PornMatcher ? window.PornMatcher.getMatchedVideos(fbSearch?.data || [], details) : [];

                if (details.dateStr) {
                    const year = details.dateStr.split(/[-.]/)[0]; 
                    fbVideos = fbVideos.filter(v => (v.n || '').includes(year)); 
                }
                video = fbVideos[0];
            } catch (e) {}
        }

        if (!video) {
            throw new Error("❌ 归档中止：115中未找到该影片！(可能是搜索接口异常或包含生僻字，请稍后再试)");
        }

        const finalFid = video.fid; 

        if (String(video.cid) !== String(targetCid)) {
            const innerCid = video.cid;
            if (innerCid !== '0') {  
                const innerRes = await req.filesAll(innerCid);
                const innerItems = innerRes?.data || [];

                const moveIds = innerItems.filter(f => {
                    if (f.fid === finalFid) return true;
                    const isSub = /\.(srt|ass|ssa|vtt|stl)$/i.test(f.n || '');
                    if (isSub) {
                        const year = details.dateStr ? details.dateStr.split('.')[0] : '';
                        if (year && f.n.includes(year)) return true;
                    }
                    return false;
                }).map(it => it.fid).filter(Boolean);

                if (moveIds.length) {
                    try { await req.filesMove(moveIds, targetCid); } catch (e) { } 
                }

                await this.cleanupOfflineSourceDirByBigVideo(innerCid, targetCid, moveIds, 100);
            }
            else { 
                try { await req.filesMove([finalFid], targetCid); } catch (e) { }
            }
            await this.sleep(1200); 
        }

        const allRes = await req.filesAll(targetCid);
        const allFiles = allRes?.data || [];
        const keep = allFiles.find(f => f.fid === finalFid);
        if (!keep) throw new Error("❌ 归档中止：目标视频文件未能成功移动到最终目录");

        const year = details.dateStr ? details.dateStr.split('.')[0] : '';
        const hasSub = allFiles.some(f => /\.(srt|ass|ssa|vtt|stl)$/i.test(f.n) && f.n.includes(year)); 
        const tags = (hasSub || /chs|cht|sub|中字|字幕|-c|_c/i.test(keep.n)) ? " 中文" : "";

        await req.handleRename([{ fid: keep.fid, n: keep.n, cid: targetCid }], targetCid, {
            rename: details.fullTitle + tags,
            renameTxt: { zh: false, crack: false, no: '', sep: '' },
            zh: false, crack: false
        });

        const expectedCoverName = `${details.matchPrefix || 'cover'}.jpg`; 
        const coverExists = allFiles.some(f => (f.n || '').toLowerCase() === expectedCoverName.toLowerCase()); 

        if (details.coverUrl && !coverExists) {
            try {
                const coverRes = await req.handleCover(details.coverUrl, targetCid, expectedCoverName);
                if (coverRes?.data?.fileid) await req.filesEdit(targetCid, coverRes.data.fileid);
            } catch (e) { }
        }
    }
};