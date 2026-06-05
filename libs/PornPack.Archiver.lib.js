/**
 * @name         PornPack Archiver Library
 * @description  低风控异步队列管理器与 115 归档清理核心
 * @version      1.0.1 (含多文件保留、字幕提取、中文标签补全)
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
            taskPollMin: 20000,      
            taskPollMax: 35000,
            dirPollMin: 35000,
            dirPollMax: 60000,
            stepGapMin: 1800,        
            stepGapMax: 3800,
            maxRetry: 35, 
            enableAutoDelete: true,
            enableAutoCover: true,
            enableAutoRematch: false
        };

        this.renameQ = typeof GM_getValue !== 'undefined' ? GM_getValue('pdb_rename_q', []) : [];
        this.pollTimer = null;
        this.pollBusy = false;
    }

    saveQ() { if (typeof GM_setValue !== 'undefined') { GM_setValue('pdb_rename_q', this.renameQ); } }
    getQueue() { return this.renameQ; }

    addTask(task) {
        this.renameQ.push(task);
        this.saveQ();
        this.scheduleNextPoll(15000, 25000);
    }

    scheduleNextPoll(min = this.LOW_RISK_CONFIG.taskPollMin, max = this.LOW_RISK_CONFIG.taskPollMax) {
        if (this.pollTimer) clearTimeout(this.pollTimer);
        if (!this.renameQ.length) return;
        this.pollTimer = setTimeout(() => { this.pollRenameQueue(); }, this.rand(min, max));
    }

    markQueueError(item, msg) {
        item.lastError = msg || '未知错误';
        item.failCount = (item.failCount || 0) + 1;
        this.saveQ();
        if (this.updateBtnUI) this.updateBtnUI(item.hash, `⚠️ ${item.lastError}`, '#d35400');
    }

    finishQueueItem(idx, item, text = '🎉 刮削完成') {
        if (this.updateBtnUI) this.updateBtnUI(item.hash, text, '#8e44ad');
        this.renameQ.splice(idx, 1);
        this.saveQ();
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

    async pollRenameQueue() {
        if (this.pollBusy || !this.renameQ.length) return;
        this.pollBusy = true;
        const tryJSON = r => { try { return JSON.parse(r.responseText); } catch { return null; } };

        try {
            const j = tryJSON(await this.safeReq115('GET', `${this.API_115.taskList}&page=1`, null, 1800, 3200));
            const tasks = j?.tasks || [];
            const item = this.renameQ[0];
            
            if (!item) { this.pollBusy = false; return; }
            item.retryCount = (item.retryCount || 0) + 1;
            this.saveQ();

            if (item.retryCount > this.LOW_RISK_CONFIG.maxRetry) {
                this.markQueueError(item, '轮询超时，已暂停归档');
                this.pollBusy = false; this.scheduleNextPoll(this.LOW_RISK_CONFIG.dirPollMin, this.LOW_RISK_CONFIG.dirPollMax); return;
            }

            const activeTask = tasks.find(t => t.info_hash && item.hash && t.info_hash.toLowerCase() === item.hash.toLowerCase());

            if (activeTask) {
                if (activeTask.status === 1) {
                    if (this.updateBtnUI) this.updateBtnUI(item.hash, `⬇️ 下载 ${Math.floor(activeTask.percent)}%`, '#f39c12');
                    this.pollBusy = false; this.scheduleNextPoll(); return;
                } else if (activeTask.status === -1) {
                    if (this.updateBtnUI) this.updateBtnUI(item.hash, `❌ 离线报错`, '#dc3545');
                    this.renameQ.splice(0, 1); this.saveQ();
                    this.pollBusy = false; this.scheduleNextPoll(); return;
                }
            }

            if (this.updateBtnUI) this.updateBtnUI(item.hash, '⏳ 正在提取影片...', '#f39c12');

            let targetItems = [];
            if (activeTask && activeTask.status === 2 && activeTask.file_id) {
                targetItems.push({ fid: '', cid: String(activeTask.file_id), n: activeTask.name || item.newName });
            } else {
                const r = await this.safeReq115('GET', `${this.API_115.fileList}?aid=1&cid=${item.cid}&limit=1000&show_dir=1&offset=0&o=user_utime&asc=0`, null, 2200, 4200);
                let allDirItems = tryJSON(r)?.data || [];
                const hashLower = String(item.hash || '').toLowerCase();
                targetItems = allDirItems.filter(f => {
                    const raw = String(f.n || '').toLowerCase();
                    if (hashLower && raw.includes(hashLower)) return true;
                    let score = window.PornMatcher ? window.PornMatcher.getOfflineRescueScore(raw, item) : 0;
                    return score >= 120;
                });

                if (targetItems.length === 0) {
                    const rescued = await this.tryRescueFromDefaultOfflineDir(item);
                    if (rescued) {
                        if (this.updateBtnUI) this.updateBtnUI(item.hash, '📦 捞回中...', '#f39c12');
                        this.pollBusy = false; this.scheduleNextPoll(); return;
                    }
                }
            }

            let isSuccess = false;

            if (targetItems.length > 0) {
                for (const target of targetItems) {
                    // 处理文件夹模式 (BT整包)
                    if (!target.fid && target.cid) {
                        const sr = await this.safeReq115('GET', `${this.API_115.fileList}?aid=1&cid=${target.cid}&limit=1000&show_dir=1&offset=0`, null, 2200, 4200);
                        const subFiles = tryJSON(sr)?.data || [];
                        let vids = subFiles.filter(f => f.ico === 'video' || /\.(mp4|mkv|avi|wmv|ts|iso)$/i.test(f.n || ''));
                        let subs = subFiles.filter(f => /\.(srt|ass|ssa|vtt|stl)$/i.test(f.n || ''));

                        // 提防一层套娃目录
                        if (vids.filter(v => v.s > 100 * 1024 * 1024).length === 0) {
                            const innerFolders = subFiles.filter(f => !f.fid && f.cid);
                            if (innerFolders.length > 0) {
                                const deepSr = await this.safeReq115('GET', `${this.API_115.fileList}?aid=1&cid=${innerFolders[0].cid}&limit=1000&show_dir=1&offset=0`, null, 2200, 4200);
                                const deepFiles = tryJSON(deepSr)?.data || [];
                                const deepVids = deepFiles.filter(f => f.ico === 'video' || /\.(mp4|mkv|avi|wmv|ts|iso)$/i.test(f.n || ''));
                                const deepSubs = deepFiles.filter(f => /\.(srt|ass|ssa|vtt|stl)$/i.test(f.n || ''));
                                vids.push(...deepVids.map(v => ({...v, isDeep: true})));
                                subs.push(...deepSubs.map(s => ({...s, isDeep: true})));
                            }
                        }

                        // 核心逻辑：保留所有大于 100MB 的视频
                        let validVids = vids.filter(v => (v.s || 0) > 100 * 1024 * 1024);

                        if (validVids.length > 0) {
                            // 多视频按名称排序以分配后缀 (-A, -B)
                            validVids.sort((a, b) => a.n.localeCompare(b.n));
                            subs.sort((a, b) => a.n.localeCompare(b.n));

                            // 探测中文特征
                            const zhRegex = /chs|cht|sub|中字|字幕|-c|_c/i;
                            const hasZh = validVids.some(v => zhRegex.test(v.n)) || subs.length > 0 || subFiles.some(f => zhRegex.test(f.n));
                            const chineseTag = hasZh ? " 中文" : "";

                            const finalDirArray = Array.isArray(item.finalDirArray) && item.finalDirArray.length ? item.finalDirArray : ['欧美演员', '未知演员', item.newName];
                            const finalCid = await this.req115.handleDir(finalDirArray);
                            
                            // 遍历移动和重命名主视频
                            for (let i = 0; i < validVids.length; i++) {
                                const vid = validVids[i];
                                const ext = (vid.n.match(/(\.[a-zA-Z0-9]{2,4})$/) || ['', '.mp4'])[1];
                                const suffix = validVids.length > 1 ? `-${String.fromCharCode(65 + i)}` : ''; // 生成 -A, -B
                                const finalName = `${item.newName}${suffix}${chineseTag}${ext}`;

                                const moveData = new URLSearchParams(); moveData.append('pid', String(finalCid)); moveData.append('fid[0]', String(vid.fid));
                                await this.safeReq115('POST', this.API_115.fileMove, moveData.toString(), this.LOW_RISK_CONFIG.stepGapMin, this.LOW_RISK_CONFIG.stepGapMax);
                                await this.safeReq115('POST', this.API_115.fileEdit, new URLSearchParams({ fid: String(vid.fid), file_name: finalName }).toString(), this.LOW_RISK_CONFIG.stepGapMin, this.LOW_RISK_CONFIG.stepGapMax);
                            }

                            // 遍历移动和重命名字幕文件
                            for (let i = 0; i < subs.length; i++) {
                                const sub = subs[i];
                                // 尽量保留 .zh.srt 等多重后缀
                                let extMatch = sub.n.match(/(\.[a-zA-Z0-9_-]+\.(srt|ass|ssa|vtt|stl)$)/i);
                                if (!extMatch) extMatch = sub.n.match(/(\.(srt|ass|ssa|vtt|stl)$)/i);
                                const ext = extMatch ? extMatch[0] : '.srt';
                                
                                // 字幕尽量和视频名称一致
                                const suffix = validVids.length > 1 && i < validVids.length ? `-${String.fromCharCode(65 + i)}` : (subs.length > 1 ? `-${i+1}` : '');
                                const finalName = `${item.newName}${suffix}${chineseTag}${ext}`;

                                const moveData = new URLSearchParams(); moveData.append('pid', String(finalCid)); moveData.append('fid[0]', String(sub.fid));
                                await this.safeReq115('POST', this.API_115.fileMove, moveData.toString(), this.LOW_RISK_CONFIG.stepGapMin, this.LOW_RISK_CONFIG.stepGapMax);
                                await this.safeReq115('POST', this.API_115.fileEdit, new URLSearchParams({ fid: String(sub.fid), file_name: finalName }).toString(), this.LOW_RISK_CONFIG.stepGapMin, this.LOW_RISK_CONFIG.stepGapMax);
                            }

                            // 清理包含垃圾文件的原始目录，阈值设定为 100MB
                            if (this.LOW_RISK_CONFIG.enableAutoDelete) {
                                await this.cleanupOfflineSourceDirByBigVideo(target.cid, item.cid, validVids.map(v => v.fid), 100);
                            }

                            if (this.LOW_RISK_CONFIG.enableAutoCover && this.req115 && item.coverUrl) {
                                try {
                                    await this.sleep(this.rand(2500, 4500));
                                    const cName = item.coverName || 'cover.jpg';
                                    const coverRes = await this.req115.handleCover(item.coverUrl, finalCid, cName);
                                    const fileId = coverRes?.data?.fileid || coverRes?.data?.file_id;
                                    if (fileId) {
                                        await this.sleep(this.rand(1500, 3000));
                                        await this.req115.filesEdit(finalCid, fileId);
                                    }
                                } catch (e) {}
                            }
                            isSuccess = true;
                            break;
                        }
                    }
                    // 处理单文件模式（如果是用户离线的单个磁力视频，并非文件夹）
                    else if (target.fid && (target.ico === 'video' || /\.(mp4|mkv|avi)$/i.test(target.n || ''))) {
                        if (target.s > 100 * 1024 * 1024) { // 阈值修改为 100MB
                            const zhRegex = /chs|cht|sub|中字|字幕|-c|_c/i;
                            const chineseTag = zhRegex.test(target.n) ? " 中文" : "";
                            const ext = (target.n.match(/(\.[a-zA-Z0-9]{2,4})$/) || ['', '.mp4'])[1];
                            const finalDirArray = Array.isArray(item.finalDirArray) && item.finalDirArray.length ? item.finalDirArray : ['欧美演员', '未知演员', item.newName];
                            const finalCid = await this.req115.handleDir(finalDirArray);

                            const moveData = new URLSearchParams(); moveData.append('pid', String(finalCid)); moveData.append('fid[0]', String(target.fid));
                            await this.safeReq115('POST', this.API_115.fileMove, moveData.toString(), this.LOW_RISK_CONFIG.stepGapMin, this.LOW_RISK_CONFIG.stepGapMax);

                            const finalName = `${item.newName}${chineseTag}${ext}`;
                            await this.safeReq115('POST', this.API_115.fileEdit, new URLSearchParams({ fid: String(target.fid), file_name: finalName }).toString(), this.LOW_RISK_CONFIG.stepGapMin, this.LOW_RISK_CONFIG.stepGapMax);

                            if (this.LOW_RISK_CONFIG.enableAutoCover && this.req115 && item.coverUrl) {
                                try {
                                    await this.sleep(this.rand(2500, 4500));
                                    const coverRes = await this.req115.handleCover(item.coverUrl, finalCid, item.coverName || 'cover.jpg');
                                    const fileId = coverRes?.data?.fileid || coverRes?.data?.file_id;
                                    if (fileId) { await this.sleep(1500); await this.req115.filesEdit(finalCid, fileId); }
                                } catch (e) {}
                            }
                            isSuccess = true;
                            break;
                        }
                    }
                }
            }

            if (isSuccess) {
                this.finishQueueItem(0, item, '🎉 刮削完成');
                this.pollBusy = false;
                if (this.LOW_RISK_CONFIG.enableAutoRematch && this.triggerAutoMatch) { setTimeout(() => this.triggerAutoMatch(), this.rand(8000, 15000)); }
                this.scheduleNextPoll(this.LOW_RISK_CONFIG.dirPollMin, this.LOW_RISK_CONFIG.dirPollMax);
                return;
            }

            this.pollBusy = false;
            this.scheduleNextPoll(this.LOW_RISK_CONFIG.dirPollMin, this.LOW_RISK_CONFIG.dirPollMax);

        } catch (e) {
            console.error('低风控轮询报错', e);
            this.pollBusy = false;
            if (this.renameQ.length) {
                this.markQueueError(this.renameQ[0], e.message || '轮询失败');
                this.scheduleNextPoll(40000, 70000);
            }
        }
    }

    async flattenAfterOffline(details, dirArray) {
        // ... (保持不变)
    }
};