/**
 * @name         PornPack Archiver Library
 * @description  基于 JavPack 高级封装链路 (Verify -> Clean -> Rename -> Cover) 的智能刮削核心
 * @version      1.0.0
 */

window.PornArchiver = class PornArchiver {
    constructor(options) {
        this.req115 = options.req115;
        this.updateBtnUI = options.updateBtnUI;
        this.sleep = options.sleep;
        this.triggerAutoMatch = options.triggerAutoMatch;
    }

    // 兼容旧版的调用接口（废弃实际后台慢队列功能，改用前端同步快跑）
    getQueue() { return []; }
    scheduleNextPoll() { }

    /**
     * 核心入口：接收主脚本的任务推送
     */
    async addTask(item) {
        try {
            const success = await this.executePipeline(item);
            if (!success) {
                if (this.updateBtnUI) this.updateBtnUI(item.hash, `验证失败/超时`, '#dc3545');
            }
        } catch (e) {
            console.error("离线高级链路执行异常:", e);
            if (this.updateBtnUI) this.updateBtnUI(item.hash, `执行异常`, '#dc3545');
        }
    }

    /**
     * 【高级封装链路核心】
     * 完全对齐 JavDB：handleVerify -> handleClean -> handleRename -> handleCover
     */
    async executePipeline(item) {
        let file_id = "";
        let videos = [];
        let srts = [];

        // ==========================================
        // 步骤 1：HandleVerify (高频验证下载状态与提取目标)
        // ==========================================
        for (let i = 0; i < 15; i++) {
            if (this.updateBtnUI) this.updateBtnUI(item.hash, `验证进度(${i + 1}/15)...`, '#f39c12');
            // 自适应间隔：前 5 次 2s，中间 5 次 1.5s，后 5 次 1s
            await this.sleep(i < 5 ? 2000 : i < 10 ? 1500 : 1000);

            const { tasks } = await this.req115.lixianTaskLists();
            const task = tasks.find(t => t.info_hash && t.info_hash.toLowerCase() === item.hash.toLowerCase());

            if (task) {
                if (task.status === 2 && task.file_id) {
                    file_id = String(task.file_id);
                    break;
                } else if (task.status === -1) {
                    if (this.updateBtnUI) this.updateBtnUI(item.hash, `离线报错`, '#dc3545');
                    return false;
                } else if (task.status === 1) {
                    if (this.updateBtnUI) this.updateBtnUI(item.hash, `下载 ${Math.floor(task.percent)}%`, '#f39c12');
                }
            }
        }

        if (!file_id) return false;

        // 提取视频文件 (强制过滤 > 100MB，保留多集)
        if (this.updateBtnUI) this.updateBtnUI(item.hash, `提取视频...`, '#f39c12');
        // 先检查是否有套娃目录，确定正确的 CID
        let videoCid = file_id;
        {
            const allFiles = await this.req115.filesAll(file_id);
            const folders = allFiles.data.filter(f => !f.fid && f.cid);
            if (folders.length > 0) videoCid = folders[0].cid;
        }
        for (let i = 0; i < 5; i++) {
            await this.sleep(1000);
            const { data } = await this.req115.filesAllVideos(videoCid);
            videos = data.filter(v => v.s > 100 * 1024 * 1024);
            if (videos.length > 0) break;
        }

        if (!videos.length) return false;

        // 提取原盘附带的字幕文件 (srt, ass, vtt等)
        try {
            const srtRes = await this.req115.filesAllSRTs(videoCid);
            srts = srtRes.data || [];
        } catch (e) { }

        const keepFiles = [...videos, ...srts];

        // ==========================================
        // 步骤 2：HandleClean (调用原生清理组件，秒杀广告和空壳)
        // ==========================================
        if (this.updateBtnUI) this.updateBtnUI(item.hash, `清理杂质...`, '#f39c12');
        await this.req115.handleClean(keepFiles, file_id);

        // ==========================================
        // 步骤 3：HandleRename (调用原生重命名组件，含多集编号和中文后缀)
        // ==========================================
        if (this.updateBtnUI) this.updateBtnUI(item.hash, `智能重命名...`, '#f39c12');

        // 严谨的中文标识判断机制
        const checkZh = (name) => {
            if (/中字|字幕|\b(chs|cht|sub)\b/i.test(name)) return true;
            if (/[-_]c(?=\.[a-zA-Z0-9]+$|$)/i.test(name)) return true;
            return false;
        };

        const hasZh = videos.some(v => checkZh(v.n)) || srts.length > 0;

        // 确保最终归档目录被创建
        const finalCid = await this.req115.handleDir(item.finalDirArray);

        // 利用 JavPack 的 handleRename 完美分配后缀 (强制关闭破解/无码标签)
        await this.req115.handleRename(keepFiles, file_id, {
            rename: item.newName,
            renameTxt: { zh: " [中文]", crack: "", no: "-${no}", sep: " " },
            zh: hasZh,
            crack: false
        });

        // ==========================================
        // 步骤 4：物理转移到最终演员目录，并彻底销毁 BT 空壳
        // ==========================================
        if (this.updateBtnUI) this.updateBtnUI(item.hash, `转移归档...`, '#f39c12');
        await this.req115.filesMove(keepFiles.map(f => f.fid), finalCid);
        await this.req115.rbDelete([file_id], item.cid);

        // ==========================================
        // 步骤 5：HandleCover (调用原生封面组件)
        // ==========================================
        if (item.coverUrl) {
            if (this.updateBtnUI) this.updateBtnUI(item.hash, `上传封面...`, '#f39c12');
            try {
                const coverRes = await this.req115.handleCover(item.coverUrl, finalCid, item.coverName || 'cover.jpg');
                if (coverRes?.data?.file_id || coverRes?.data?.fileid) {
                    await this.sleep(1500);
                    await this.req115.filesEdit(finalCid, coverRes.data.file_id || coverRes.data.fileid);
                }
            } catch (e) { }
        }

        // ==========================================
        // 步骤 6：全链路完成，触发界面刷新
        // ==========================================
        if (this.updateBtnUI) this.updateBtnUI(item.hash, `制尪完成`, '#8e44ad');
        if (this.triggerAutoMatch) setTimeout(() => this.triggerAutoMatch(), 2500);

        return true;
    }

    async flattenAfterOffline(details, dirArray, directVideo = null) {
        const targetCid = await this.req115.handleDir(dirArray);
        if (!targetCid) throw new Error("无法创建或获取目标目录");

        let video = directVideo; // 直接接收前端传来的精确目标

        // 只有在前端没传精确目标时，才去执行它原本的“盲搜”兜底
        if (!video) {
            const safeSearchKw = (kw) => (kw || '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, ' ').replace(/\s+/g, ' ').trim();
            let searchRes = await this.req115.filesSearchAllVideos(safeSearchKw(details.matchPrefix).substring(0, 40));
            let videos = window.PornMatcher ? window.PornMatcher.getMatchedVideos(searchRes?.data || [], details) : [];
            video = videos[0];

            if (!video && details.titleKeyword) {
                let fbSearch = await this.req115.filesSearchAllVideos(safeSearchKw(details.titleKeyword).substring(0, 40));
                let fbVideos = window.PornMatcher ? window.PornMatcher.getMatchedVideos(fbSearch?.data || [], details) : [];
                if (details.dateStr) {
                    const year = details.dateStr.split(/[-.]/)[0];
                    fbVideos = fbVideos.filter(v => (v.n || '').includes(year));
                }
                video = fbVideos[0];
            }
        }

        if (!video) throw new Error("归档中止：115中未找到该影片！");

        const sourceCid = video.cid;
        const sourceFid = video.fid;

        // 原生提取关联字幕
        const srtRes = await this.req115.filesAllSRTs(sourceCid);
        const srts = srtRes?.data || [];
        const keepFiles = [video, ...srts];

        // 转移至目标目录并清理旧目录垃圾
        if (String(sourceCid) !== String(targetCid)) {
            await this.req115.filesMove(keepFiles.map(f => f.fid), targetCid);
            if (sourceCid !== '0') {
                const remaining = await this.req115.filesAllVideos(sourceCid);
                if (!remaining?.data?.filter(v => v.s > 100 * 1024 * 1024).length) {
                    await this.req115.rbDelete([sourceCid]);
                }
            }
            await this.sleep(1200);
        }

        // 严谨的中文标识判断机制
        const checkZh = (name) => {
            if (/中字|字幕|\b(chs|cht|sub)\b/i.test(name)) return true;
            if (/[-_]c(?=\.[a-zA-Z0-9]+$|$)/i.test(name)) return true;
            return false;
        };
        const hasZh = checkZh(video.n) || srts.length > 0;

        let cleanRawTitle = details.titlePart || details.title || '';
        let maker = details.maker ? details.maker.trim() : '';
        if (maker && cleanRawTitle.toLowerCase().startsWith(maker.toLowerCase())) {
            cleanRawTitle = cleanRawTitle.substring(maker.length).replace(/^[^a-zA-Z0-9\u4e00-\u9fa5]+/, '').trim();
        }
        let cleanNewName = (details.matchPrefix ? `${details.matchPrefix} ${cleanRawTitle}` : details.fullTitle).replace(/\s+/g, ' ').trim();

        // 仅保留中文标签挂载，关闭 crack 标签
        await this.req115.handleRename(keepFiles, targetCid, {
            rename: cleanNewName,
            renameTxt: { zh: " [中文]", crack: "", no: "-${no}", sep: " " },
            zh: hasZh,
            crack: false
        });

        // 原生封面挂载
        if (details.coverUrl) {
            const coverRes = await this.req115.handleCover(details.coverUrl, targetCid, `${details.baseAlpha}.${details.dateStr}.jpg`);
            if (coverRes?.data?.fileid || coverRes?.data?.file_id) {
                await this.req115.filesEdit(targetCid, coverRes.data.fileid || coverRes.data.file_id);
            }
        }
    }
};