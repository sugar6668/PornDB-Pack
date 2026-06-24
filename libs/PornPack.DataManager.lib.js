/**
 * @name         PornPack Data Manager Library
 * @description  数据备份、恢复与 WebDAV 云端同步模块
 * @version      1.0.0
 */

window.PornDataManager = class PornDataManager {
    static BTN_ID = 'data-manager-btn';
    static WEBDAV_CONF_KEY = 'pdb_webdav_config';

    // 定义属于“核心资产”的键名，包含喜爱演员、各种过滤器/白名单设置
    static CORE_KEYS = [
        'pdb_fav_performers',
        'pdb_filter_config',
        'pdb_studio_whitelist_v1',
        'JavPack_Config'
    ];

    static ensureButtonExists(doc) {
        // [MOD] 核心修复：1. 尝试寻找详情页的 115 控制台标题栏
        const consoleWrap = doc.querySelector('.x-west-wrap');
        const consoleTitle = consoleWrap ? consoleWrap.querySelector('div') : null;

        // [MOD] 核心修复：2. 尝试寻找瀑布流页的全局过滤面板
        let group = doc.getElementById('jav-filter-group');
        if (!consoleTitle && !group && window.PornDOMTweaks) {
            group = window.PornDOMTweaks.getOrCreateActionBar(doc);
        }

        // 如果既没有控制台也没有过滤面板，或者按钮已存在，则退出
        if ((!consoleTitle && !group) || doc.getElementById(this.BTN_ID)) return;

        const btn = doc.createElement('button');
        btn.id = this.BTN_ID;
        btn.className = 'jav-filter-btn';
        btn.innerHTML = '数据管理';
        btn.style.cssText = 'margin-right: 10px; background-color: #f3f4f6; color: #4b5563; border-color: #d1d5db; display: inline-flex; align-items: center; justify-content: center;';

        btn.onmouseover = () => { btn.style.backgroundColor = '#e5e7eb'; };
        btn.onmouseout = () => { btn.style.backgroundColor = '#f3f4f6'; };
        btn.onclick = (e) => {
            e.preventDefault();
            this.openManagerModal();
        };

        // [ADD] 根据当前页面环境，精准把按钮插入对应的容器最前方
        if (consoleTitle) {
            consoleTitle.insertBefore(btn, consoleTitle.firstChild);
        } else if (group) {
            group.insertBefore(btn, group.firstChild);
        }
    }

    static openManagerModal() {
        const overlayId = 'pdb-data-manager-modal';
        if (document.getElementById(overlayId)) return;

        const conf = JSON.parse(GM_getValue(this.WEBDAV_CONF_KEY, '{}'));
        const defaultUrl = conf.url || '';
        const defaultUser = conf.user || '';
        const defaultPass = conf.pass || '';

        // [MOD] 彻底干掉内联样式，全部由 porndb-ui.css 接管
        const overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.className = 'pdb-dm-overlay';
        
        // [MOD] 彻底删除内联面条代码，直接从全局资源库调用模板函数，并传入所需的变量
        overlay.innerHTML = window.PornUIAssets.templates.dataManagerModal(defaultUrl, defaultUser, defaultPass);

        document.body.appendChild(overlay);

        // 事件绑定
        document.getElementById('dm-close-btn').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        // 保存配置
        document.getElementById('dm-save-dav').onclick = () => {
            const url = document.getElementById('dm-dav-url').value.trim();
            const user = document.getElementById('dm-dav-user').value.trim();
            const pass = document.getElementById('dm-dav-pass').value.trim();
            GM_setValue(this.WEBDAV_CONF_KEY, JSON.stringify({ url, user, pass }));
            alert('WebDAV 配置已保存本地！');
        };

        const getChecks = () => ({
            core: document.getElementById('chk-core').checked,
            match: document.getElementById('chk-match').checked,
            dir: document.getElementById('chk-dir').checked
        });

        document.getElementById('btn-export-local').onclick = () => this.exportLocal(getChecks());

        const fileInput = document.getElementById('dm-file-input');
        document.getElementById('btn-import-local').onclick = () => fileInput.click();
        fileInput.onchange = (e) => {
            if (!e.target.files.length) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    this.restoreData(data);
                    alert('本地数据导入成功！页面即将刷新...');
                    location.reload();
                } catch (err) { alert('文件解析失败，请确保是合法的备份 JSON'); }
            };
            reader.readAsText(e.target.files[0]);
        };

        document.getElementById('btn-push-dav').onclick = () => this.pushWebDAV(getChecks());
        document.getElementById('btn-pull-dav').onclick = () => this.pullWebDAV();
    }

    // --- 数据组装与恢复逻辑 ---
    static buildBackupData(checks) {
        const backup = { version: '1.0', timestamp: Date.now(), core_data: {}, match_caches: {}, dir_caches: {} };

        if (checks.core) {
            this.CORE_KEYS.forEach(key => {
                let val = GM_getValue(key);
                // [MOD] 终极防漏：如果油猴 API 里没存上，去网页原生缓存里找找看
                if (val === undefined || val === null) {
                    const localVal = localStorage.getItem(key);
                    if (localVal) {
                        try { val = JSON.parse(localVal); }
                        catch (e) { val = localVal; }
                    }
                }

                if (val !== undefined && val !== null) {
                    backup.core_data[key] = val;
                }
            });
        }

        const allKeys = GM_listValues();
        allKeys.forEach(key => {
            if (checks.match && key.startsWith('pdb_v4_')) backup.match_caches[key] = GM_getValue(key);
            else if (checks.dir && key === 'pdb_dir_cache_v2') backup.dir_caches[key] = GM_getValue(key);
        });

        return backup;
    }

    static restoreData(data) {
        // 1. 恢复核心资产
        if (data.core_data) {
            Object.entries(data.core_data).forEach(([key, value]) => {
                // 特殊处理：喜爱演员采取“合并（并集）”策略防丢
                if (key === 'pdb_fav_performers') {
                    try {
                        const localArr = JSON.parse(GM_getValue(key, '[]'));
                        const cloudArr = JSON.parse(value || '[]');
                        const mergedSet = new Set([...localArr, ...cloudArr]);
                        GM_setValue(key, JSON.stringify([...mergedSet]));
                    } catch (e) { }
                } else {
                    // 过滤器/白名单 直接覆盖
                    GM_setValue(key, value);
                }
            });
        }

        // 2. 恢复匹配缓存 (直接覆盖)
        if (data.match_caches) {
            Object.entries(data.match_caches).forEach(([k, v]) => GM_setValue(k, v));
        }

        // 3. 恢复目录缓存 (直接覆盖)
        if (data.dir_caches) {
            Object.entries(data.dir_caches).forEach(([k, v]) => GM_setValue(k, v));
        }
    }

    // --- IO 操作实现 ---

    static exportLocal(checks) {
        const data = this.buildBackupData(checks);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        // [MOD] 精确到秒的时间戳生成器
        const now = new Date();
        const pad = n => n.toString().padStart(2, '0');
        const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

        link.download = `porndb_backup_${timeStr}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    static getWebDAVAuth() {
        const conf = JSON.parse(GM_getValue(this.WEBDAV_CONF_KEY, '{}'));
        if (!conf.url || !conf.user || !conf.pass) {
            alert('请先填写完整的 WebDAV 配置！');
            return null;
        }
        let url = conf.url.trim();
        if (!url.endsWith('/')) url += '/';
        // [MOD] 智能建档逻辑：如果用户只填了网盘根目录，自动追加专属文件夹
        if (url.endsWith('/dav/') || url.split('/').length <= 4) {
            url += 'PornDB_Backup/';
        }

        url += 'porndb_sync_data.json';

        const auth = 'Basic ' + btoa(`${conf.user.trim()}:${conf.pass.trim()}`);
        return { url, auth };
    }

    static pushWebDAV(checks) {
        const authInfo = this.getWebDAVAuth();
        if (!authInfo) return;

        const data = this.buildBackupData(checks);
        const jsonStr = JSON.stringify(data);

        const btn = document.getElementById('btn-push-dav');
        btn.textContent = '建档中...';

        // 提取父级目录的 URL (去掉最后的文件名)
        const folderUrl = authInfo.url.substring(0, authInfo.url.lastIndexOf('/') + 1);

        // 核心上传逻辑 (PUT)
        const uploadFile = () => {
            btn.textContent = '推送中...';
            GM_xmlhttpRequest({
                method: 'PUT',
                url: authInfo.url,
                headers: { 'Authorization': authInfo.auth, 'Content-Type': 'application/json' },
                data: jsonStr,
                onload: (res) => {
                    btn.textContent = '推送备份到 WebDAV';
                    if (res.status >= 200 && res.status < 300) alert('成功推送到 WebDAV！');
                    else alert(`推送失败，HTTP 状态码: ${res.status}\n请检查坚果云应用密码是否正确。`);
                },
                onerror: () => {
                    btn.textContent = '推送备份到 WebDAV';
                    alert('网络请求失败，请检查 WebDAV 地址或跨域权限');
                }
            });
        };

        // [ADD] 自动创建文件夹逻辑 (MKCOL)
        GM_xmlhttpRequest({
            method: 'MKCOL',
            url: folderUrl,
            headers: { 'Authorization': authInfo.auth },
            onload: (res) => {
                // 状态码 201 代表创建成功，405 代表文件夹已经存在。
                // 无论存在与否，只要网络通了，就继续执行上传文件的逻辑。
                uploadFile();
            },
            onerror: () => {
                // 即使创建目录请求因为某些限制失败，依然强行尝试上传作为兜底
                uploadFile();
            }
        });
    }

    static pullWebDAV() {
        const authInfo = this.getWebDAVAuth();
        if (!authInfo) return;

        document.getElementById('btn-pull-dav').textContent = '拉取中...';

        GM_xmlhttpRequest({
            method: 'GET',
            url: authInfo.url,
            headers: { 'Authorization': authInfo.auth },
            onload: (res) => {
                document.getElementById('btn-pull-dav').textContent = '从 WebDAV 恢复';
                if (res.status === 200) {
                    try {
                        const data = JSON.parse(res.responseText);
                        this.restoreData(data);
                        alert('云端数据恢复成功！页面即将刷新...');
                        location.reload();
                    } catch (e) { alert('解析云端文件失败'); }
                } else if (res.status === 404) {
                    alert('云端未找到备份文件，请先推送一次。');
                } else {
                    alert(`拉取失败，HTTP 状态码: ${res.status}`);
                }
            },
            onerror: () => {
                document.getElementById('btn-pull-dav').textContent = '从 WebDAV 恢复';
                alert('网络请求失败，请检查 WebDAV 地址或跨域权限');
            }
        });
    }
};