/**
 * @name         PornPack Data18 Media Library
 * @description  Fetches Data18 trailers and preview images for ThePornDB scene detail pages.
 * @version      1.0.2
 */

(function () {
    "use strict";

    const CACHE_PREFIX = "data18_media_v1_";
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
    const DATA18_ORIGIN = "https://www.data18.com";
    const IMAGE_PROBE_MAX = 40;
    const IMAGE_PROBE_STOP_MISSES = 5;
    const DEBUG = true;

    const safeString = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const unique = (items) => [...new Set(items.filter(Boolean))];

    const Data18Media = {
        // ★ 修复: 持久化 age gate 状态, 防止重复触发
        _data18Agreed: false,
        _retrying: false,

        async ensurePanel(doc = document) {
            try {
                if (!doc || !doc.querySelector) return;
                if (!this.isScenePage(doc)) return;
                if (!window.PornParser || typeof window.PornParser.parseWestDetails !== "function") return;

                const details = window.PornParser.parseWestDetails(doc);
                if (!details || !details.isValid) return;

                const pageKey = this.getPageKey(details, doc);
                if (!pageKey) return;

                const oldPanel = doc.querySelector(".x-data18-wrap");
                if (oldPanel) {
                    if (oldPanel.dataset.key === pageKey) return;
                    oldPanel.remove();
                }

                const panel = this.createPanel(doc, pageKey);
                if (!this.insertPanel(doc, panel)) return;

                this.setStatus(panel, "正在搜索 Data18...");

                const cacheKey = CACHE_PREFIX + pageKey;
                const cached = this.getCache(cacheKey);
                if (cached) {
                    this.renderMedia(panel, cached);
                    return;
                }

                const media = await this.findMedia(details);
                if (!media) {
                    this.setStatus(panel, "Data18 未找到媒体");
                    return;
                }

                this.setCache(cacheKey, media);
                this.renderMedia(panel, media);
            } catch (err) {
                console.warn("[PornData18Media] ensurePanel failed:", err);
            }
        },

        isScenePage(doc) {
            const href = doc.location && doc.location.href ? doc.location.href : location.href;
            return /\/scenes\//.test(href);
        },

        getPageKey(details, doc = document) {
            const href = doc.location && doc.location.href ? doc.location.href : location.href;
            const title = this.getSearchTitle(details);
            return safeString(title ? `title_${title}` : href);
        },

        createPanel(doc, key) {
            const panel = doc.createElement("section");
            panel.className = "x-data18-wrap";
            panel.dataset.key = key;
            panel.innerHTML = `
                <div class="x-data18-head">
                    <div class="x-data18-title">Data18 预览</div>
                    <div class="x-data18-status">准备搜索...</div>
                </div>
                <div class="x-data18-body"></div>
            `;
            return panel;
        },

        insertPanel(doc, panel) {
            const westPanel = doc.querySelector(".x-west-wrap");
            if (westPanel && westPanel.parentElement) {
                westPanel.parentElement.insertBefore(panel, westPanel);
                return true;
            }

            const fallbackTarget =
                doc.querySelector("video")?.parentElement?.parentElement ||
                doc.querySelector("div.bg-black.text-white") ||
                doc.querySelector("div.w-full.bg-white");

            if (fallbackTarget) {
                fallbackTarget.insertAdjacentElement("afterend", panel);
                return true;
            }

            return false;
        },

        setStatus(panel, text) {
            const node = panel && panel.querySelector ? panel.querySelector(".x-data18-status") : null;
            if (node) node.textContent = text;
        },

        getSearchTitle(details) {
            return safeString(details && details.titlePart);
        },

        buildSearchKeywords(details) {
            const title = this.getSearchTitle(details);
            return title.length >= 3 ? [title] : [];
        },

        // ★ FIX: 修正 keyfull 参数格式, 不加 scene 也能搜
        buildSearchUrl(keyword) {
            const clean = safeString(keyword);
            const keyfull = clean.toLowerCase(); // 保持原样，不要转 --
            const params = new URLSearchParams();
            params.set("index", "");
            params.set("key", clean);
            params.set("key2", clean);
            params.set("keyfull", keyfull);
            params.set("t", "0");
            params.set("b", "1");
            params.set("page", "1");
            params.set("back", `${DATA18_ORIGIN}/scenes`);
            params.set("scenesource", "1");
            return `${DATA18_ORIGIN}/sys/live.php?${params.toString()}`;
        },

        // ★ FIX: 完整重写 fetchFromData18, 增加 age gate 自动通过
        async fetchFromData18(url, options = {}) {
            const {
                method = "GET",
                referer = `${DATA18_ORIGIN}/`,
                accept = "text/html, */*; q=0.01",
                ajax = false,
                returnResponse = false,
                timeout = 20000
            } = options;

            // 首次调用时先通过 age gate
            if (!this._data18Agreed) {
                await this._passAgeGate();
                this._data18Agreed = true;
            }

            return new Promise((resolve, reject) => {
                const headers = {
                    "User-Agent": navigator.userAgent,
                    "Accept": accept,
                    "Referer": referer
                };
                if (ajax) headers["X-Requested-With"] = "XMLHttpRequest";

                GM_xmlhttpRequest({
                    method,
                    url,
                    headers,
                    timeout,
                    onload: (res) => {
                        // 如果返回的是 age gate 页面，重新通过门禁再试
                        if (res.responseText && /ADULTS ONLY|age-restricted|captcha/i.test(res.responseText) && !this._retrying) {
                            this._retrying = true;
                            this._data18Agreed = false;
                            this.fetchFromData18(url, options).then(resolve).catch(reject);
                            return;
                        }
                        this._retrying = false;
                        if (returnResponse) { resolve(res); return; }
                        if (res.status >= 200 && res.status < 300) {
                            resolve(res.responseText || "");
                        } else {
                            reject(new Error(`Data18 HTTP Error: ${res.status}`));
                        }
                    },
                    onerror: () => reject(new Error("Data18 request error")),
                    ontimeout: () => reject(new Error("Data18 request timeout"))
                });
            });
        },

        // ★ NEW: 通过 age gate
        async _passAgeGate() {
            const captchaUrl = `${DATA18_ORIGIN}/sys/captcha`;
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: captchaUrl,
                    headers: {
                        "User-Agent": navigator.userAgent,
                        "Referer": `${DATA18_ORIGIN}/`
                    },
                    timeout: 15000,
                    onload: (res) => resolve(res),
                    onerror: () => {
                        console.warn("[PornData18Media] age gate bypass failed, continuing anyway...");
                        resolve();
                    },
                    ontimeout: () => resolve()
                });
            });
        },

        async findMedia(details) {
            const keywords = this.buildSearchKeywords(details);

            for (const keyword of keywords) {
                try {
                    const searchUrl = this.buildSearchUrl(keyword);
                    this.debug("search url", searchUrl);

                    const searchHtml = await this.fetchFromData18(searchUrl, {
                        referer: `${DATA18_ORIGIN}/`,
                        accept: "text/html, */*; q=0.01",
                        ajax: true
                    });
                    const results = this.parseSearchResults(searchHtml);
                    this.debug("search results", results);

                    const matchedResults = this.pickExactTitleResults(results, details);
                    this.debug("exact title results", matchedResults);
                    if (!matchedResults.length) continue;

                    for (const best of matchedResults) {
                        this.debug("best detail url", best.url);
                        this.debug("page scene id", best.sceneId);

                        const detailHtml = await this.fetchFromData18(best.url, {
                            referer: `${DATA18_ORIGIN}/`,
                            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                            ajax: true
                        });
                        const media = await this.collectMediaFromDetail(detailHtml, best.url, best.sceneId);
                        this.debug("final media", media);

                        if (media.videoUrl || media.images.length) {
                            return {
                                keyword,
                                searchTitle: this.getSearchTitle(details),
                                sourceUrl: best.url,
                                sceneId: best.sceneId,
                                mediaId: media.mediaId,
                                videoUrl: media.videoUrl,
                                images: media.images
                            };
                        }
                    }
                } catch (err) {
                    console.warn("[PornData18Media] search failed:", keyword, err);
                }
            }

            return null;
        },

        parseSearchResults(html) {
            const dom = new DOMParser().parseFromString(String(html || ""), "text/html");
            const links = [...dom.querySelectorAll('a[href*="/scenes/"]')];
            const seen = new Set();

            return links
                .map((a) => {
                    const href = a.getAttribute("href");
                    if (!href) return null;

                    const url = new URL(href, DATA18_ORIGIN).href;
                    const match = url.match(/\/scenes\/(\d+)(?:[/?#]|$)/i);
                    if (!match) return null;

                    const sceneId = match[1];
                    if (seen.has(sceneId)) return null;
                    seen.add(sceneId);

                    return {
                        url,
                        sceneId,
                        text: safeString(a.textContent)
                    };
                })
                .filter(Boolean);
        },

        normalizeTitle(value) {
            return safeString(value)
                .toLowerCase()
                .replace(/[‘’]/g, "'")
                .replace(/[“”]/g, '"')
                .replace(/&/g, "and")
                .replace(/[^a-z0-9]+/g, " ")
                .trim();
        },

        isExactTitleMatch(result, details) {
            const title = this.normalizeTitle(this.getSearchTitle(details));
            const text = this.normalizeTitle(result && result.text);
            return Boolean(title && text && title === text);
        },

        pickExactTitleResults(results, details) {
            if (!results || !results.length) return [];
            return results.filter((item) => this.isExactTitleMatch(item, details));
        },

        // ★ FIX: 完整替换 collectMediaFromDetail, 优先使用 bdn.dt18.com 构造图片 URL
        async collectMediaFromDetail(html, detailUrl, pageSceneId = "") {
            const direct = this.extractMedia(html, detailUrl);
            this.debug("direct media", direct);

            const mediaId = this.extractMediaId(html, detailUrl, pageSceneId);
            this.debug("internal media id", mediaId);

            const currentPhotoId = this.extractCurrentPhotoId(html, detailUrl);
            this.debug("current photo id", currentPhotoId);

            const photoIds = this.extractPhotoIds(html, detailUrl);
            this.debug("photo ids", photoIds);

            // ★ 提取 network_id + site_id，优先通过 bdn.dt18.com 构造图片
            const ids = this.extractNetworkSiteIds(html);
            this.debug("network/site ids", ids);

            // ★ 直接从 bdn.dt18.com URL 模式构造预览图
            const bdnImages = [];
            if (ids.network_id && ids.site_id && mediaId) {
                const photoCount = this.extractPhotoCount(html) || 8;
                for (let i = 1; i <= Math.min(photoCount, IMAGE_PROBE_MAX); i++) {
                    bdnImages.push(
                        `https://bdn.dt18.com/${ids.network_id}/${ids.site_id}/${mediaId}/t${String(i).padStart(2, "0")}.jpg`
                    );
                }
            }
            this.debug("bdn constructed images", bdnImages);

            // 从 AJAX 接口获取图片 (可能被 age gate 阻挡，作为备选)
            const interfaceImages = mediaId
                ? await this.fetchPhotoInterfaceImages({ mediaId, photoIds, currentPhotoId, detailUrl, html })
                : [];

            const interfaceVideo = mediaId
                ? await this.fetchTrailerInterfaceVideo({ mediaId, currentPhotoId, detailUrl })
                : "";
            this.debug("player interface video", interfaceVideo);

            const lazyUrls = this.extractLazyUrls(html, detailUrl);
            this.debug("lazy urls", lazyUrls);
            const lazyMedia = await this.fetchLazyMedia(lazyUrls, detailUrl);

            // ★ 合并：bdb 构造优先 + AJAX 接口图片 + fallback
            const allImages = unique([...bdnImages, ...interfaceImages]);

            const fallbackImages = allImages.length
                ? []
                : await this.filterExistingImages(this.buildImageCandidates([...direct.images, ...lazyMedia.images]), detailUrl);
            this.debug("fallback tNN images", fallbackImages);

            const videos = unique([interfaceVideo, ...direct.videos, ...lazyMedia.videos]);
            const images = this.sortImages(unique([...allImages, ...fallbackImages]));

            return {
                mediaId,
                videoUrl: videos[0] || "",
                images
            };
        },

        // ★ NEW: 从 HTML 中提取 network_id (studio) 和 site_id
        extractNetworkSiteIds(html) {
            const source = this.normalizeHtml(html);
            const ids = { network_id: "", site_id: "" };

            // 提取 network_id: studio=338
            const networkMatch = source.match(/\bstudio\s*[=:]\s*["']?(\d{2,6})["']?/i);
            if (networkMatch) ids.network_id = networkMatch[1];

            // 提取 site_id: dosite=2984
            const siteMatch = source.match(/\bdosite\s*[=:]\s*["']?(\d{2,6})["']?/i);
            if (siteMatch) ids.site_id = siteMatch[1];

            // 备选: 从 bdn.dt18.com URL 反向提取
            if (!ids.network_id || !ids.site_id) {
                const bdnMatch = source.match(/https?:\/\/bdn\.dt18\.com\/(\d+)\/(\d+)\/\d+\/t\d+\.jpg/i);
                if (bdnMatch) {
                    ids.network_id = ids.network_id || bdnMatch[1];
                    ids.site_id = ids.site_id || bdnMatch[2];
                }
            }

            // 备选: 从 network/studios 页面链接中提取
            if (!ids.network_id) {
                const navMatch = source.match(/changenav.*?studio[_-](\d+)/i);
                if (navMatch) ids.network_id = navMatch[1];
            }

            return ids;
        },

        extractPageSceneId(url) {
            const match = String(url || "").match(/\/scenes\/(\d+)(?:[/?#]|$)/i);
            return match ? match[1] : "";
        },

        extractMediaId(html, detailUrl, pageSceneId = "") {
            const source = this.normalizeHtml(html);
            const candidates = [];
            const addMatches = (pattern) => {
                let match;
                while ((match = pattern.exec(source))) {
                    if (match[1]) candidates.push(String(match[1]));
                }
            };

            addMatches(/\/sys\/(?:media_photos|media_thumbs|media_galleries)\.php\?[^"'<>\s]*\bscene=(\d{5,})/gi);
            addMatches(/\/sys\/user\.php\?[^"'<>\s]*(?:\bid=|\bscene=|\bitem=)(\d{5,})/gi);
            addMatches(/\/sys\/media_big\.php\?[^"'<>\s]*\bsc=(\d{5,})/gi);
            addMatches(/\/sys\/media_tools\.php\?[^"'<>\s]*\bsc=(\d{5,})/gi);
            addMatches(/\b(?:scene|id|item|sc)\s*[:=]\s*["']?(\d{5,})/gi);
            addMatches(/\b(?:scene|id|item|sc)=(\d{5,})/gi);

            const pageId = String(pageSceneId || this.extractPageSceneId(detailUrl));
            const counts = new Map();
            candidates.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));

            const sorted = [...counts.entries()]
                .sort((a, b) => (a[0] === pageId ? 1 : 0) - (b[0] === pageId ? 1 : 0) || b[1] - a[1]);
            return sorted[0] ? sorted[0][0] : pageId;
        },

        extractCurrentPhotoId(html, detailUrl) {
            const fromHash = String(detailUrl || "").match(/#image(\d+)/i);
            if (fromHash) return fromHash[1];

            const source = this.normalizeHtml(html);
            const patterns = [
                /#image(\d{1,5})/i,
                /\bchange_image\(\s*(\d{1,5})\s*\)/i,
                /\bpic=(\d{1,5})/i,
                /\bid=["']?(?:photoimg|image)(\d{1,5})["']?/i
            ];
            for (const pattern of patterns) {
                const match = source.match(pattern);
                if (match) return match[1];
            }
            return "";
        },

        extractPhotoIds(html, detailUrl) {
            const source = this.normalizeHtml(html);
            const ids = new Set();
            const collect = (pattern) => {
                let match;
                while ((match = pattern.exec(source))) {
                    if (match[1]) ids.add(String(match[1]));
                }
            };

            collect(/#image(\d{1,5})/gi);
            collect(/\bid=["'](?:next2_|next_|newest_|gallery)(\d{1,5})["']/gi);
            collect(/\bid=["'](\d{1,5})["']/gi);
            collect(/\bchange_image\(\s*(\d{1,5})\s*\)/gi);
            collect(/\bpic=(\d{1,5})/gi);

            const current = this.extractCurrentPhotoId(html, detailUrl);
            if (current) ids.add(current);

            return [...ids].sort((a, b) => Number(a) - Number(b));
        },

        extractPhotoCount(html) {
            const source = this.normalizeHtml(html);
            const photos = source.match(/Photos\s*\[\s*(\d+)\s*\]/i);
            if (photos) return Number(photos[1]);
            const imageOf = source.match(/Image\s+\d+\s+of\s+(\d+)/i);
            return imageOf ? Number(imageOf[1]) : 0;
        },

        async fetchPhotoInterfaceImages({ mediaId, photoIds, currentPhotoId, detailUrl, html }) {
            const ids = unique([...(photoIds || []), currentPhotoId].map((id) => String(id || "")).filter(Boolean));
            const urls = ids.map((pic) => this.buildPhotoInterfaceUrl(mediaId, pic));
            this.debug("photo interface urls", urls);

            const images = [];
            for (const pic of ids) {
                const url = this.buildPhotoInterfaceUrl(mediaId, pic);
                try {
                    const responseHtml = await this.fetchFromData18(url, {
                        referer: detailUrl,
                        accept: "text/html, */*; q=0.01",
                        ajax: true,
                        timeout: 15000
                    });
                    const media = this.extractMedia(responseHtml, url);
                    this.debug("photo interface result", { url, images: media.images });
                    images.push(...media.images);
                } catch (err) {
                    console.warn("[PornData18Media] photo interface failed:", url, err);
                }
            }

            const expectedCount = this.extractPhotoCount(html);
            if (expectedCount && images.length < expectedCount) {
                const galleryImages = await this.fetchGalleryInterfaceImages(mediaId, detailUrl, ids);
                images.push(...galleryImages);
            }

            return this.sortImages(unique(images));
        },

        async fetchGalleryInterfaceImages(mediaId, detailUrl, knownPhotoIds = []) {
            const urls = [
                `${DATA18_ORIGIN}/sys/media_galleries.php?s=1&scene=${encodeURIComponent(mediaId)}`,
                `${DATA18_ORIGIN}/sys/media_galleries.php?scene=${encodeURIComponent(mediaId)}&s=1&pic=${encodeURIComponent(knownPhotoIds[0] || "")}`
            ];
            this.debug("gallery interface urls", urls);

            const images = [];
            const extraIds = new Set();
            for (const url of urls) {
                try {
                    const html = await this.fetchFromData18(url, {
                        referer: detailUrl,
                        accept: "text/html, */*; q=0.01",
                        ajax: true,
                        timeout: 15000
                    });
                    const media = this.extractMedia(html, url);
                    images.push(...media.images);
                    this.extractPhotoIds(html, detailUrl).forEach((id) => {
                        if (!knownPhotoIds.includes(id)) extraIds.add(id);
                    });
                } catch (err) {
                    console.warn("[PornData18Media] gallery interface failed:", url, err);
                }
            }

            for (const id of [...extraIds].sort((a, b) => Number(a) - Number(b)).slice(0, 80)) {
                const url = this.buildPhotoInterfaceUrl(mediaId, id);
                try {
                    const html = await this.fetchFromData18(url, {
                        referer: detailUrl,
                        accept: "text/html, */*; q=0.01",
                        ajax: true,
                        timeout: 15000
                    });
                    images.push(...this.extractMedia(html, url).images);
                } catch (err) {
                    console.warn("[PornData18Media] gallery photo failed:", url, err);
                }
            }

            return this.sortImages(unique(images));
        },

        buildPhotoInterfaceUrl(mediaId, pic) {
            return `${DATA18_ORIGIN}/sys/media_photos.php?s=1&scene=${encodeURIComponent(mediaId)}&pic=${encodeURIComponent(pic)}`;
        },

        async fetchTrailerInterfaceVideo({ mediaId, currentPhotoId, detailUrl }) {
            const screen = this.getScreenWidth();
            const pic = encodeURIComponent(currentPhotoId || "");
            const encodedMediaId = encodeURIComponent(mediaId);
            const urls = [
                `${DATA18_ORIGIN}/sys/user.php?player=1&trailer=1&id=${encodedMediaId}&s=1&photochange=${pic}&screen=${screen}`,
                `${DATA18_ORIGIN}/sys/user.php?player=1&trailer=1&id=${encodedMediaId}&s=1&photochange=${pic}&big=1&screen=${screen}`,
                `${DATA18_ORIGIN}/sys/media_big.php?sc=${encodedMediaId}&s=1&movie=0&playtrailer=1`,
                `${DATA18_ORIGIN}/sys/media_tools.php?sc=${encodedMediaId}&s=1&trailer=1&mscene=`
            ];
            this.debug("player interface urls", urls);

            const visited = new Set();
            for (const url of urls) {
                const video = await this.fetchVideoFromInterface(url, detailUrl, visited);
                this.debug("player interface result", { url, video });
                if (video) return video;
            }
            return "";
        },

        async fetchVideoFromInterface(url, referer, visited) {
            if (!url || visited.has(url)) return "";
            visited.add(url);

            try {
                const html = await this.fetchFromData18(url, {
                    referer,
                    accept: "text/html,application/json,*/*;q=0.8",
                    ajax: true,
                    timeout: 16000
                });
                const media = this.extractMedia(html, url);
                if (media.videos[0]) return media.videos[0];

                const nextUrls = this.extractNestedVideoUrls(html, url);
                for (const nextUrl of nextUrls.slice(0, 8)) {
                    const nested = await this.fetchVideoFromInterface(nextUrl, referer, visited);
                    if (nested) return nested;
                }
            } catch (err) {
                console.warn("[PornData18Media] trailer interface failed:", url, err);
            }
            return "";
        },

        extractNestedVideoUrls(html, baseUrl) {
            const source = this.normalizeHtml(html);
            const urls = new Set();
            const patterns = [
                /<(?:iframe|source|video)\b[^>]*\bsrc=["']([^"']+)["']/gi,
                /\b(?:url|src|file)\s*[:=]\s*["']([^"']+)["']/gi,
                /fetch\(\s*["']([^"']+)["']/gi
            ];
            patterns.forEach((pattern) => {
                let match;
                while ((match = pattern.exec(source))) {
                    const url = this.absoluteUrl(match[1], baseUrl);
                    if (this.isData18Url(url) && /player|trailer|video|media|user\.php|media_big|\.mp4/i.test(url)) {
                        urls.add(url);
                    }
                }
            });
            return [...urls];
        },

        getScreenWidth() {
            try {
                return Math.max(1024, Number(window.innerWidth || screen.width || 1280));
            } catch (err) {
                return 1280;
            }
        },

        parseMedia(html) {
            const media = this.extractMedia(html, DATA18_ORIGIN);
            return {
                videoUrl: media.videos[0] || "",
                images: this.sortImages(media.images)
            };
        },

        extractMedia(html, baseUrl) {
            const source = this.normalizeHtml(html);
            const videos = [];
            const images = [];

            try {
                const dom = new DOMParser().parseFromString(source, "text/html");
                dom.querySelectorAll("source[src], video[src]").forEach((node) => {
                    const url = this.absoluteUrl(node.getAttribute("src"), baseUrl);
                    if (this.isMp4Url(url)) videos.push(url);
                });
                dom.querySelectorAll("img[src]").forEach((node) => {
                    const url = this.absoluteUrl(node.getAttribute("src"), baseUrl);
                    if (this.isPreviewImageUrl(url)) images.push(url);
                });
            } catch (err) {
                console.warn("[PornData18Media] DOM media parse failed:", err);
            }

            const mp4Patterns = [
                /https?:\/\/vs\.dt18\.com[^\s"'<>\\]+?\.mp4(?:\?[^\s"'<>\\]*)?/gi,
                /https?:\/\/[^\s"'<>\\]+?\.mp4(?:\?[^\s"'<>\\]*)?/gi
            ];
            mp4Patterns.forEach((pattern) => {
                const matches = source.match(pattern) || [];
                matches.forEach((url) => {
                    const normalized = this.cleanUrl(url);
                    if (this.isMp4Url(normalized)) videos.push(normalized);
                });
            });

            const imagePatterns = [
                /https?:\/\/bdn\.dt18\.com[^\s"'<>\\]+?\.jpg(?:\?[^\s"'<>\\]*)?/gi,
                /https?:\/\/[^\s"'<>\\]+?\/t\d{2}\.jpg(?:\?[^\s"'<>\\]*)?/gi
            ];
            imagePatterns.forEach((pattern) => {
                const matches = source.match(pattern) || [];
                matches.forEach((url) => {
                    const normalized = this.cleanUrl(url);
                    if (this.isPreviewImageUrl(normalized)) images.push(normalized);
                });
            });

            return {
                videos: unique(videos),
                images: this.sortImages(unique(images))
            };
        },

        buildImageCandidates(images) {
            const candidates = new Set();
            images.forEach((imageUrl) => {
                const clean = this.stripQuery(imageUrl);
                const match = clean.match(/^(.*\/t)(\d{2})(\.jpg)$/i);
                if (!match) {
                    candidates.add(imageUrl);
                    return;
                }

                for (let i = 1; i <= IMAGE_PROBE_MAX; i++) {
                    candidates.add(`${match[1]}${String(i).padStart(2, "0")}${match[3]}`);
                }
            });

            return this.sortImages([...candidates]);
        },

        async filterExistingImages(candidates, referer) {
            const existing = [];
            let consecutiveMisses = 0;

            for (const url of this.sortImages(unique(candidates))) {
                const exists = await this.imageExists(url, referer);
                if (exists) {
                    existing.push(url);
                    consecutiveMisses = 0;
                } else {
                    consecutiveMisses += 1;
                    if (existing.length && consecutiveMisses >= IMAGE_PROBE_STOP_MISSES) break;
                }
            }

            return this.sortImages(unique(existing));
        },

        async imageExists(url, referer) {
            try {
                const head = await this.fetchFromData18(url, {
                    method: "HEAD",
                    referer,
                    accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                    returnResponse: true,
                    timeout: 10000
                });
                if (this.isOkStatus(head.status)) return true;
                if (head.status && ![403, 405, 0].includes(Number(head.status))) return false;
            } catch (err) {}

            try {
                const get = await this.fetchFromData18(url, {
                    method: "GET",
                    referer,
                    accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                    returnResponse: true,
                    timeout: 12000
                });
                return this.isOkStatus(get.status);
            } catch (err) {
                return false;
            }
        },

        extractLazyUrls(html, detailUrl) {
            const source = this.normalizeHtml(html);
            const urls = new Set();
            const attrPattern = /\b(?:href|src|data-url|data-src|data-href)\s*=\s*["']([^"']+)["']/gi;
            const jsPatterns = [
                /\b(?:url|ajaxurl)\s*[:=]\s*["']([^"']+)["']/gi,
                /fetch\(\s*["']([^"']+)["']/gi,
                /\$\.get\(\s*["']([^"']+)["']/gi,
                /\$\.ajax\(\s*\{[^}]*\burl\s*:\s*["']([^"']+)["']/gi
            ];

            const collect = (pattern) => {
                let match;
                while ((match = pattern.exec(source))) {
                    const url = this.absoluteUrl(match[1], detailUrl);
                    if (this.isLazyMediaUrl(url)) urls.add(url);
                }
            };

            collect(attrPattern);
            jsPatterns.forEach(collect);
            return [...urls];
        },

        async fetchLazyMedia(urls, referer) {
            const videos = [];
            const images = [];

            for (const url of urls.slice(0, 12)) {
                try {
                    const html = await this.fetchFromData18(url, {
                        referer,
                        accept: "text/html,application/json,*/*;q=0.8",
                        ajax: true,
                        timeout: 15000
                    });
                    const media = this.extractMedia(html, url);
                    videos.push(...media.videos);
                    images.push(...media.images);
                } catch (err) {
                    console.warn("[PornData18Media] lazy request failed:", url, err);
                }
            }

            return {
                videos: unique(videos),
                images: this.sortImages(unique(images))
            };
        },

        isData18Url(url) {
            if (!url || !/^https?:\/\//i.test(url)) return false;
            try {
                const host = new URL(url).hostname.toLowerCase();
                return /(^|\.)data18\.com$|(^|\.)dt18\.com$/.test(host);
            } catch (err) {
                return false;
            }
        },

        isLazyMediaUrl(url) {
            if (!url || !/^https?:\/\//i.test(url)) return false;
            let parsed;
            try {
                parsed = new URL(url);
            } catch (err) {
                return false;
            }

            const host = parsed.hostname.toLowerCase();
            if (!/(^|\.)data18\.com$|(^|\.)dt18\.com$/.test(host)) return false;

            if (/^\/scenes\//i.test(parsed.pathname)) return false;

            const text = `${parsed.pathname} ${parsed.search}`.toLowerCase();
            return /trailer|preview|photo|photos|image|images|gallery|video|media|scene/.test(text);
        },

        isPreviewImageUrl(url) {
            return /^https?:\/\/bdn\.dt18\.com\/.*\.jpg(?:\?.*)?$/i.test(url || "");
        },

        isMp4Url(url) {
            return /^https?:\/\/[^\s"'<>]+\.mp4(?:\?.*)?$/i.test(url || "");
        },

        isOkStatus(status) {
            const code = Number(status);
            return code >= 200 && code < 300;
        },

        sortImages(images) {
            return [...images].sort((a, b) => this.imageSortKey(a) - this.imageSortKey(b) || String(a).localeCompare(String(b)));
        },

        imageSortKey(url) {
            const match = String(url || "").match(/\/t(\d{2})\.jpg/i);
            return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
        },

        normalizeHtml(html) {
            return this.decodeHtmlEntities(String(html || ""))
                .replace(/\\\//g, "/")
                .replace(/\\u002[fF]/g, "/")
                .replace(/\\x2[fF]/g, "/");
        },

        decodeHtmlEntities(value) {
            const raw = String(value || "");
            const named = raw
                .replace(/&amp;/g, "&")
                .replace(/&quot;/g, '"')
                .replace(/&#39;|&apos;/g, "'")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">");

            return named.replace(/&#(x?[0-9a-f]+);/gi, (all, code) => {
                const value = code.charAt(0).toLowerCase() === "x"
                    ? parseInt(code.slice(1), 16)
                    : parseInt(code, 10);
                return Number.isFinite(value) ? String.fromCodePoint(value) : all;
            });
        },

        cleanUrl(url) {
            return this.decodeHtmlEntities(String(url || ""))
                .replace(/\\\//g, "/")
                .replace(/\\u002[fF]/g, "/")
                .trim();
        },

        stripQuery(url) {
            return String(url || "").split("?")[0];
        },

        absoluteUrl(url, baseUrl) {
            if (!url) return "";
            try {
                return new URL(this.cleanUrl(url), baseUrl || DATA18_ORIGIN).href;
            } catch (err) {
                return "";
            }
        },

        renderMedia(panel, media) {
            const body = panel.querySelector(".x-data18-body");
            if (!body) return;

            const items = [];
            if (media.videoUrl) items.push({ type: "video", src: media.videoUrl });
            if (Array.isArray(media.images)) {
                media.images.forEach((url) => items.push({ type: "image", src: url }));
            }

            if (!items.length) {
                this.setStatus(panel, "Data18 未找到媒体");
                body.innerHTML = "";
                return;
            }

            const videoCount = media.videoUrl ? 1 : 0;
            const imageCount = Array.isArray(media.images) ? media.images.length : 0;
            this.setStatus(panel, `已找到 ${videoCount} 个预告片 / ${imageCount} 张预览图`);

            body.innerHTML = `
                <div class="x-data18-media-strip" aria-label="Data18 预告片和预览图">
                    ${items.map((item) => this.renderMediaCard(item)).join("")}
                </div>
            `;
            this.bindPreviewEvents(panel);
        },

        renderMediaCard(item) {
            const src = this.escapeAttr(item.src);
            if (item.type === "video") {
                return `
                    <button class="x-data18-media-card x-data18-video-card" type="button" data-type="video" data-src="${src}">
                        <video class="x-data18-thumb-video" src="${src}" preload="metadata" muted playsinline referrerpolicy="no-referrer"></video>
                        <span class="x-data18-play-badge">▶</span>
                    </button>
                `;
            }

            return `
                <button class="x-data18-media-card x-data18-image-card" type="button" data-type="image" data-src="${src}">
                    <img class="x-data18-thumb-img" src="${src}" loading="lazy" referrerpolicy="no-referrer">
                </button>
            `;
        },

        bindPreviewEvents(panel) {
            panel.querySelectorAll(".x-data18-media-card").forEach((card) => {
                card.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const type = card.dataset.type;
                    const src = card.dataset.src;
                    if (type && src) this.openLightbox(type, src, panel.ownerDocument || document);
                });
            });
        },

        openLightbox(type, src, doc = document) {
            this.closeLightbox(doc);

            const box = doc.createElement("div");
            box.className = "x-data18-lightbox";
            box.setAttribute("role", "dialog");
            box.setAttribute("aria-modal", "true");
            box.innerHTML = `
                <button class="x-data18-lightbox-close" type="button" aria-label="关闭">×</button>
                <div class="x-data18-lightbox-inner"></div>
            `;

            const inner = box.querySelector(".x-data18-lightbox-inner");
            const safeSrc = this.escapeAttr(src);
            if (type === "video") {
                inner.innerHTML = `
                    <video class="x-data18-lightbox-video" src="${safeSrc}" controls preload="metadata" playsinline referrerpolicy="no-referrer"></video>
                `;
            } else {
                inner.innerHTML = `
                    <img class="x-data18-lightbox-img" src="${safeSrc}" referrerpolicy="no-referrer">
                `;
            }

            const onKeyDown = (event) => {
                if (event.key === "Escape") this.closeLightbox(doc);
            };
            box.__data18Keydown = onKeyDown;

            box.addEventListener("click", (event) => {
                if (event.target === box) this.closeLightbox(doc);
            });
            box.querySelector(".x-data18-lightbox-close")?.addEventListener("click", () => this.closeLightbox(doc));
            doc.addEventListener("keydown", onKeyDown);
            doc.body.appendChild(box);
        },

        closeLightbox(doc = document) {
            const old = doc.querySelector(".x-data18-lightbox");
            if (!old) return;

            if (old.__data18Keydown) doc.removeEventListener("keydown", old.__data18Keydown);
            old.querySelectorAll("video").forEach((video) => {
                try {
                    video.pause();
                    video.removeAttribute("src");
                    video.load();
                } catch (err) {}
            });
            old.remove();
        },

        // fetchFromData18 — FIXED VERSION (已在上方定义)
        // fetchFromData18, _passAgeGate, extractNetworkSiteIds are above

        getCache(key) {
            if (typeof GM_getValue !== "function") return null;
            const data = GM_getValue(key, null);
            if (!data || !data.ts) return null;
            if (Date.now() - data.ts > CACHE_TTL) {
                if (typeof GM_deleteValue === "function") GM_deleteValue(key);
                return null;
            }
            return data;
        },

        setCache(key, data) {
            if (typeof GM_setValue !== "function") return;
            GM_setValue(key, { ...data, ts: Date.now() });
        },

        clearData18Cache() {
            if (typeof GM_listValues !== "function" || typeof GM_deleteValue !== "function") {
                console.warn("[PornData18Media] GM cache APIs are unavailable");
                return 0;
            }

            const keys = GM_listValues().filter((key) => String(key).startsWith(CACHE_PREFIX));
            keys.forEach((key) => GM_deleteValue(key));
            console.info(`[PornData18Media] cleared ${keys.length} Data18 cache item(s)`);
            return keys.length;
        },

        debug(label, payload) {
            if (DEBUG) console.log(`[PornData18Media] ${label}:`, payload);
        },

        escapeAttr(str) {
            return String(str || "")
                .replace(/&/g, "&amp;")
                .replace(/"/g, "&quot;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
        }
    };

    window.PornData18Media = Data18Media;
})();
