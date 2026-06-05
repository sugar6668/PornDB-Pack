/**
 * @name         PornPack Archiver Library
 * @description  低风控异步队列管理器与 115 归档清理核心
 * @version      1.0.0
 */

window.PornArchiver = class PornArchiver {
    /**
     * @param {Object} options - 传入外部依赖的工具函数和UI回调
     */
    constructor(options) {
        this.safeReq115 = options.safeReq115;
        this.req115 = options.req115; // 外部引入的 Req115 实例
        this.updateBtnUI = options.updateBtnUI;
        this.sleep = options.sleep;
        this.rand = options.rand;
        this.triggerAutoMatch = options.triggerAutoMatch; // 完成后刷新页面UI的回调

        this.API_115 = {
            taskList: 'https://115.com/web/lixian/?ct=lixian&ac=task_lists',
            fileList: 'https://webapi.115.com/files',
            fileEdit: 'https://webapi.115.com/files/edit',
            fileMove: 'https://webapi.115.com/files/move',
        };

        this.LOW_RISK_CONFIG = {
            taskPollMin: 25000,      // 任务轮询最短间隔25秒
            taskPollMax: 45000,
            dirPollMin: 35000,
            dirPollMax: 60000,
            stepGapMin: 1800,        // 操作最小间隔
            stepGapMax: 3800,
            maxRetry: 18,            // 最大重试次数
            enableAutoDelete: true,
            enableAutoCover: true,
            enableAutoRematch: false
        };

        // 内部管理队列状态
        this.renameQ = typeof GM_getValue !== 'undefined' ? GM_getValue('pdb_rename_q', []) : [];
        this.pollTimer = null;
        this.pollBusy = false;
    }

    saveQ() {
        if (typeof GM_setValue !== 'undefined') {
            GM_setValue('pdb_rename_q', this.renameQ);
        }
    }

    getQueue() {
        return this.renameQ;
    }

    addTask(task) {
        this.renameQ.push(task);
        this.saveQ();
        this.scheduleNextPoll(15000, 25000);
    }

    scheduleNextPoll(min = this.LOW_RISK_CONFIG.taskPollMin, max = this.LOW_RISK_CONFIG.taskPollMax) {
        if (this.pollTimer) clearTimeout(this.pollTimer);
        if (!this.renameQ.length) return;
        this.pollTimer = setTimeout(() => {
            this.pollRenameQueue();
        }, this.rand(min, max));
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

    /**
     * 115 秒传兜底搬运
     */
    async tryRescueFromDefaultOfflineDir(item) {
        if (!item || !item.cid) return false;
        try {
            const searchR = await this.safeReq115('GET', `${this.API_115.fileList}?aid=1&cid=0&limit=100&show_dir=1&offset=0&o=user_utime&asc=0`, null, 1200, 2200);
            
            const tryJSON = r => { try { return JSON.parse(r.responseText); } catch { return null; } };
            const defaultItems = tryJSON(searchR)?.data || [];
            if (!defaultItems.length) return false;

            const nowSec = Date.now() / 1000;
            const freshItems = defaultItems.filter((f) => {
                const t = Number(f.te || f.t || 0);
                return t === 0 || t >= nowSec - 10 * 60;
            });

            if (!freshItems.length) return false;

            const candidate = freshItems
                .map((f) => {
                    const rawName = String(f.n || '').toLowerCase();
                    // 依赖已抽离的 PornMatcher 库
                    let score = window.PornMatcher ? window.PornMatcher.getOfflineRescueScore(rawName, item) : 0;
                    
                    const hashLower = String(item.hash || '').toLowerCase();
                    if (hashLower && rawName.includes(hashLower)) score += 300;
                    
                    const nameLower = String(item.newName || '').toLowerCase();
                    if (nameLower && rawName.includes(nameLower)) score += 60;

                    if (!f.fid && f.cid) score += 20;

                    const t = Number(f.te || f.t || 0);
                    if (t > 0) score += Math.max(0, 600 - (nowSec - t)) / 20;

                    return { ...f, _score: score };
                })
                .filter((f) => f._score >= 180)
                .sort((a, b) => b._score - a._score)[0];

            if (!candidate) return false;

            const moveId = candidate.fid || candidate.cid;
            if (!moveId) return false;

            const moveData = new URLSearchParams();
            moveData.append('pid', String(item.cid));
            moveData.append('fid[0]', String(moveId));

            await this.safeReq115('POST', this.API_115.fileMove, moveData.toString(), 1500, 2600);
            return true;
        } catch (e) {
            console.warn('秒传兜底搬运失败：', e);
            return false;
        }
    }

    /**
     * 清理旧目录
     */
    async cleanupOfflineSourceDirByBigVideo(sourceCid, parentCid, movedFids = [], sizeThresholdMB = 150) {
        if (!this.req115 || !sourceCid || !parentCid) return false;
        try {
            const sourceRes = await this.req115.filesAll(sourceCid);
            const sourceItems = sourceRes?.data || [];
            const movedSet = new Set((movedFids || []).map(String));
            const sizeThreshold = sizeThresholdMB * 1024 * 1024;

            const remainingBigVideos = sourceItems.filter((f) => {
                if (f.fid && movedSet.has(String(f.fid))) return false;
                const name = String(f.n || '').toLowerCase();
                const size = Number(f.s || f.size || 0);
                const isVideo = /\.(mp4|mkv|avi|wmv|ts|flv|rmvb|m2ts|iso|mov)$/i.test(name) || f.ico === 'video';
                return isVideo && size > sizeThreshold;
            });

            if (remainingBigVideos.length === 0) {
                await this.req115.rbDelete([sourceCid], parentCid);
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    /**
     * 核心轮询系统
     */
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
                this.markQueueError(item, '轮询次数过多，已暂停');
                this.pollBusy = false;
                this.scheduleNextPoll(this.LOW_RISK_CONFIG.dirPollMin, this.LOW_RISK_CONFIG.dirPollMax);
                return;
            }

            const activeTask = tasks.find(t => t.info_hash && item.hash && t.info_hash.toLowerCase() === item.hash.toLowerCase());

            const r = await this.safeReq115('GET', `${this.API_115.fileList}?aid=1&cid=${item.cid}&limit=20&show_dir=1&offset=0&o=user_utime&asc=0`, null, 2200, 4200);
            let allDirItems = tryJSON(r)?.data || [];

            const freshThreshold = Date.now() / 1000 - 30 * 60;
            let recentItems = allDirItems.filter(f => {
                const t = Number(f.te || f.t || 0);
                return t === 0 || t >= freshThreshold;
            });

            // 秒传兜底触发
            if (recentItems.length === 0) {
                const rescued = await this.tryRescueFromDefaultOfflineDir(item);
                if (rescued) {
                    await this.sleep(this.rand(2000, 3500));
                    const retryR = await this.safeReq115('GET', `${this.API_115.fileList}?aid=1&cid=${item.cid}&limit=20&show_dir=1&offset=0&o=user_utime&asc=0`, null, 1800, 3200);
                    allDirItems = tryJSON(retryR)?.data || [];
                    recentItems = allDirItems.filter(f => {
                        const t = Number(f.te || f.t || 0);
                        return t === 0 || t >= freshThreshold;
                    });
                }
            }

            let isSuccess = false;

            if (recentItems.length > 0) {
                for (const target of recentItems) {
                    // 处理文件夹模式 (BT整包)
                    if (!target.fid && target.cid) {
                        const sr = await this.safeReq115('GET', `${this.API_115.fileList}?aid=1&cid=${target.cid}&limit=100&show_dir=1&offset=0`, null, 2200, 4200);
                        const subFiles = tryJSON(sr)?.data || [];
                        let vids = subFiles.filter(f => f.ico === 'video' || /\.(mp4|mkv|avi|wmv|ts|iso)$/i.test(f.n || ''));

                        // 套娃防御
                        if (vids.length === 0) {
                            const innerFolders = subFiles.filter(f => !f.fid && f.cid);
                            if (innerFolders.length > 0) {
                                const deepSr = await this.safeReq115('GET', `${this.API_115.fileList}?aid=1&cid=${innerFolders[0].cid}&limit=100&show_dir=1&offset=0`, null, 2200, 4200);
                                const deepFiles = tryJSON(deepSr)?.data || [];
                                let deepVids = deepFiles.filter(f => f.ico === 'video' || /\.(mp4|mkv|avi|wmv|ts|iso)$/i.test(f.n || ''));
                                if (deepVids.length > 0) { vids = deepVids; vids.forEach(v => v.isDeep = true); }
                            }
                        }

                        if (vids.length) {
                            let bigVids = vids.filter(v => (v.s || 0) > 150 * 1024 * 1024);
                            let mainVid = bigVids.length === 1 ? bigVids[0] : (bigVids.sort((a, b) => (b.s || 0) - (a.s || 0))[0] || vids[0]);

                            if (mainVid && mainVid.s > 50 * 1024 * 1024) {
                                const ext = (mainVid.n.match(/(\.[a-zA-Z0-9]{2,4})$/) || ['', '.mp4'])[1];
                                const finalDirArray = Array.isArray(item.finalDirArray) && item.finalDirArray.length ? item.finalDirArray : ['欧美演员', '未知演员', item.newName];
                                
                                const finalCid = await this.req115.handleDir(finalDirArray);
                                
                                if (mainVid.isDeep) {
                                    const mData = new URLSearchParams();
                                    mData.append('pid', target.cid);
                                    mData.append('fid[0]', mainVid.fid);
                                    await this.safeReq115('POST', this.API_115.fileMove, mData.toString(), this.LOW_RISK_CONFIG.stepGapMin, this.LOW_RISK_CONFIG.stepGapMax);
                                }

                                const moveData = new URLSearchParams();
                                moveData.append('pid', String(finalCid));
                                moveData.append('fid[0]', String(mainVid.fid));
                                await this.safeReq115('POST', this.API_115.fileMove, moveData.toString(), this.LOW_RISK_CONFIG.stepGapMin, this.LOW_RISK_CONFIG.stepGapMax);

                                await this.safeReq115('POST', this.API_115.fileEdit, new URLSearchParams({ fid: String(mainVid.fid), file_name: item.newName + ext }).toString(), this.LOW_RISK_CONFIG.stepGapMin, this.LOW_RISK_CONFIG.stepGapMax);

                                if (this.LOW_RISK_CONFIG.enableAutoDelete) {
                                    await this.cleanupOfflineSourceDirByBigVideo(target.cid, item.cid, [mainVid.fid], 150);
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
                    }
                    // 处理单文件模式（包含我们在第二步修复的逻辑）
                    else if (target.fid && (target.ico === 'video' || /\.(mp4|mkv|avi)$/i.test(target.n || ''))) {
                        if (target.s > 50 * 1024 * 1024) {
                            const ext = (target.n.match(/(\.[a-zA-Z0-9]{2,4})$/) || ['', '.mp4'])[1];
                            const finalDirArray = Array.isArray(item.finalDirArray) && item.finalDirArray.length ? item.finalDirArray : ['欧美演员', '未知演员', item.newName];
                            const finalCid = await this.req115.handleDir(finalDirArray);

                            const moveData = new URLSearchParams();
                            moveData.append('pid', String(finalCid));
                            moveData.append('fid[0]', String(target.fid));
                            await this.safeReq115('POST', this.API_115.fileMove, moveData.toString(), this.LOW_RISK_CONFIG.stepGapMin, this.LOW_RISK_CONFIG.stepGapMax);

                            await this.safeReq115('POST', this.API_115.fileEdit, new URLSearchParams({ fid: String(target.fid), file_name: item.newName + ext }).toString(), this.LOW_RISK_CONFIG.stepGapMin, this.LOW_RISK_CONFIG.stepGapMax);

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
                }
            }

            if (isSuccess) {
                this.finishQueueItem(0, item, '🎉 刮削完成');
                this.pollBusy = false;
                if (this.LOW_RISK_CONFIG.enableAutoRematch && this.triggerAutoMatch) {
                    setTimeout(() => this.triggerAutoMatch(), this.rand(8000, 15000));
                }
                this.scheduleNextPoll(this.LOW_RISK_CONFIG.dirPollMin, this.LOW_RISK_CONFIG.dirPollMax);
                return;
            }

            if (activeTask) {
                if (activeTask.status === 1) this.updateBtnUI(item.hash, `⬇️ 下载 ${Math.floor(activeTask.percent)}%`, '#f39c12');
                else if (activeTask.status === -1) {
                    this.updateBtnUI(item.hash, `❌ 离线报错`, '#dc3545');
                    this.renameQ.splice(0, 1); this.saveQ();
                    this.pollBusy = false; this.scheduleNextPoll(); return;
                } else this.updateBtnUI(item.hash, '⏳ 检查目录...', '#f39c12');
            } else {
                this.updateBtnUI(item.hash, '⏳ 目录生成中...', '#f39c12');
            }

            this.pollBusy = false;
            this.scheduleNextPoll(this.LOW_RISK_CONFIG.dirPollMin, this.LOW_RISK_CONFIG.dirPollMax);

        } catch (e) {
            this.pollBusy = false;
            if (this.renameQ.length) {
                this.markQueueError(this.renameQ[0], e.message || '轮询失败');
                this.scheduleNextPoll(40000, 70000);
            }
        }
    }

    /**
     * 一键智能刮削与归档核心 (原 flattenAfterOffline)
     */
    async flattenAfterOffline(details, dirArray) {
        if (!this.req115) return;
        const targetCid = await this.req115.handleDir(dirArray);
        if (!targetCid) throw new Error("无法创建或获取目标目录");

        const safeSearchKw = (kw) => (kw || '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, ' ').replace(/\s+/g, ' ').trim();

        let searchRes = null, video = null;
        try {
            let kw1 = safeSearchKw(details.matchPrefix).substring(0, 40);
            searchRes = await this.req115.filesSearchAllVideos(kw1);
            let videos = window.PornMatcher ? window.PornMatcher.getMatchedVideos(searchRes?.data || [], details) : [];
            video = videos[0];
        } catch (e) { console.warn("搜索异常..."); }

        if (!video && details.titleKeyword) {
            let kw2 = safeSearchKw(details.titleKeyword).substring(0, 40);
            let fbSearch = await this.req115.filesSearchAllVideos(kw2);
            let fbVideos = window.PornMatcher ? window.PornMatcher.getMatchedVideos(fbSearch?.data || [], details) : [];
            if (details.dateStr) {
                const year = details.dateStr.split(/[-.]/)[0];
                fbVideos = fbVideos.filter(v => (v.n || '').includes(year));
            }
            video = fbVideos[0];
        }

        if (!video) throw new Error("❌ 归档中止：115中未找到该影片！");

        const finalFid = video.fid;
        if (String(video.cid) !== String(targetCid)) {
            const innerCid = video.cid;
            if (innerCid !== '0') {
                const innerRes = await this.req115.filesAll(innerCid);
                const innerItems = innerRes?.data || [];
                const moveIds = innerItems.filter(f => {
                    if (f.fid === finalFid) return true;
                    if (/\.(srt|ass|ssa|vtt|stl)$/i.test(f.n || '')) {
                        const year = details.dateStr ? details.dateStr.split('.')[0] : '';
                        if (year && f.n.includes(year)) return true;
                    }
                    return false;
                }).map(it => it.fid).filter(Boolean);

                if (moveIds.length) {
                    try { await this.req115.filesMove(moveIds, targetCid); } catch (e) {}
                }
                await this.cleanupOfflineSourceDirByBigVideo(innerCid, targetCid, moveIds, 150);
            } else {
                try { await this.req115.filesMove([finalFid], targetCid); } catch (e) {}
            }
            await this.sleep(1200);
        }

        const allRes = await this.req115.filesAll(targetCid);
        const allFiles = allRes?.data || [];
        const keep = allFiles.find(f => f.fid === finalFid);
        if (!keep) throw new Error("❌ 归档中止：目标视频文件未能成功移动到最终目录");

        const year = details.dateStr ? details.dateStr.split('.')[0] : '';
        const hasSub = allFiles.some(f => /\.(srt|ass|ssa|vtt|stl)$/i.test(f.n) && f.n.includes(year));
        let tags = (hasSub || /chs|cht|sub|中字|字幕|-c|_c/i.test(keep.n)) ? " 中文" : "";

        await this.req115.handleRename([{ fid: keep.fid, n: keep.n, cid: targetCid }], targetCid, {
            rename: details.fullTitle + tags,
            renameTxt: { zh: false, crack: false, no: '', sep: '' }, zh: false, crack: false
        });

        const expectedCoverName = `${details.matchPrefix || 'cover'}.jpg`;
        const coverExists = allFiles.some(f => (f.n || '').toLowerCase() === expectedCoverName.toLowerCase());
        if (details.coverUrl && !coverExists) {
            try {
                const coverRes = await this.req115.handleCover(details.coverUrl, targetCid, expectedCoverName);
                if (coverRes?.data?.fileid) await this.req115.filesEdit(targetCid, coverRes.data.fileid);
            } catch (e) {}
        }
    }
};