// ==UserScript==
// @name         PornDB Data18 Media Bridge
// @namespace    PornDB.Data18
// @version      2.4.5
// @description  在PornDB详情页展示DATA18预告片和高清预览图
// @icon         https://theporndb.net/favicon.ico
// @match        *://theporndb.net/scenes/*
// @match        *://*.theporndb.net/scenes/*
// @require      https://github.com/Tampermonkey/utils/raw/d8a4543a5f828dfa8eefb0a3360859b6fe9c3c34/requires/gh_2215_make_GM_xhr_more_parallel_again.js
// @connect      data18.com
// @connect      www.data18.com
// @connect      bdn.dt18.com
// @connect      vs.dt18.com
// @connect      cdn.dt18.com
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    "use strict";

    const CACHE_PREFIX = "data18_media_v1_";
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
    const DATA18_ORIGIN = "https://www.data18.com";
    const IMAGE_PROBE_MAX = 40;
    const IMAGE_PROBE_STOP_MISSES = 5;
    const SEARCH_PAGE_MAX = 100;
    const DEBUG = true;

    const safeString = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const unique = (items) => [...new Set(items.filter(Boolean))];

    const Data18Media = {
        _data18Agreed: false,
        _retrying: false,

        getPornDbSceneTitle(doc) {
            const h2 = doc.querySelector('h2.text-3xl') || doc.querySelector('h2[class*="text-3xl"]');
            if (h2) {
                const t = h2.textContent.trim();
                if (t.length > 5) return t;
            }
            const h1 = doc.querySelector('h1');
            if (h1) {
                const t = h1.textContent.trim();
                if (t.length > 5) return t;
            }
            return '';
        },

        getPornDbSceneActors(doc) {
            const actors = [];
            try {
                // PornDB pages show actors as links to /models/ or /pornstars/
                const actorLinks = doc.querySelectorAll('a[href*="/models/"], a[href*="/pornstars/"]');
                for (const a of actorLinks) {
                    const name = a.textContent.trim();
                    if (name.length > 2 && name !== 'Unknown Model') actors.push(name);
                }
            } catch (e) {
                this.debug("getPornDbSceneActors failed", e);
            }
            return actors;
        },

        getPornDbMovieName(doc) {
            try {
                // Look for a parent movie/series link on the PornDB page
                const movieLinks = doc.querySelectorAll('a[href*="/movies/"]');
                for (const a of movieLinks) {
                    const text = a.textContent.trim();
                    if (text.length > 2) return text;
                }
            } catch (e) {
                this.debug("getPornDbMovieName failed", e);
            }
            return '';
        },

        getPornDbSceneMeta(doc) {
            const meta = { date: '', studio: '' };
            const dateContainers = doc.querySelectorAll('div.whitespace-nowrap');
            for (const el of dateContainers) {
                const txt = el.textContent.trim().replace(/^-\s*/, '');
                const m = txt.match(/([a-zA-Z]{3,})\s+(\d{1,2}),\s+(\d{4})/);
                if (m) { meta.date = this._normalizeDateStr(m[0]); break; }
            }
            if (!meta.date) {
                const m = doc.body.textContent.match(/([a-zA-Z]{3,})\s+(\d{1,2}),\s+(\d{4})/);
                if (m) meta.date = this._normalizeDateStr(m[0]);
            }
            const siteNode = doc.querySelector('a[href*="/sites/"]') || doc.querySelector('a[href*="/studios/"]') || doc.querySelector('a[href*="/networks/"]');
            if (siteNode) {
                const text = Array.from(siteNode.childNodes)
                    .filter(n => n.nodeType === Node.TEXT_NODE)
                    .map(n => n.textContent.trim())
                    .join('') || siteNode.textContent.trim();
                if (text) meta.studio = this._normalizeStudioName(text);
            }
            if (!meta.studio) {
                for (const el of doc.querySelectorAll('div.whitespace-nowrap')) {
                    const txt = el.textContent.trim();
                    if (meta.date && txt.includes('-')) {
                        const candidate = txt.split('-')[0].trim();
                        if (candidate && candidate.length < 40) {
                            meta.studio = this._normalizeStudioName(candidate);
                            break;
                        }
                    }
                }
            }
            return meta;
        },

        _normalizeDateStr(dateStr) {
            const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
                             jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
            const txt = String(dateStr).trim();
            let m = txt.match(/([a-zA-Z]{3,})\s+(\d{1,2}),\s+(\d{4})/);
            if (m) {
                const mm = months[m[1].toLowerCase().substring(0, 3)];
                if (!mm) return '';
                return `${m[3]}-${mm}-${String(m[2]).padStart(2, '0')}`;
            }
            m = txt.match(/(\d{4})[-\/](\d{2})[-\/](\d{2})/);
            if (m) return `${m[1]}-${m[2]}-${m[3]}`;
            m = txt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            if (m) return `${m[3]}-${m[1]}-${m[2]}`;
            return '';
        },

        _normalizeStudioName(name) {
            return safeString(name).toLowerCase().replace(/\s+/g, '');
        },

        async ensurePanel(doc = document) {
            try {
                if (!doc || !doc.querySelector) return;
                if (!this.isScenePage(doc)) return;

                const rawTitle = this.getPornDbSceneTitle(doc);
                if (!rawTitle || rawTitle.length < 3) return;

                const pageMeta = this.getPornDbSceneMeta(doc);
                this.debug("pageMeta", pageMeta);

                const cleanTitle = this.cleanSearchTitle(rawTitle, pageMeta);
                const titleNorm = this.normalizeTitle(cleanTitle);
                const pageUrl = (doc.location && doc.location.href) || location.href;
                const pornDbSceneId = (pageUrl.match(/\/scenes\/(\d+)/) || [])[1] || '';

                this.debug("rawTitle", rawTitle);
                this.debug("cleanTitle", cleanTitle);
                this.debug("titleNorm", titleNorm);

                const pageKey = safeString(`title_${cleanTitle || rawTitle}`);

                const oldPanel = doc.querySelector(".x-data18-wrap");
                if (oldPanel) {
                    if (oldPanel.dataset.key === pageKey) return;
                    oldPanel.remove();
                }

                let anchor = doc.querySelector('.x-data18-anchor');
                if (!anchor) {
                    anchor = doc.createElement('div');
                    anchor.className = 'x-data18-anchor';
                    this._insertAnchor(doc, anchor);
                }

                const panel = this.createPanel(doc, pageKey);
                anchor.appendChild(panel);
                this._panel = panel;

                this.setStatus(panel, "正在搜索 Data18...");

                // 缓存查找
                const cacheKeys = [
                    CACHE_PREFIX + safeString(`scene_${pornDbSceneId}`),
                    CACHE_PREFIX + safeString(`url_${pageUrl}`),
                    CACHE_PREFIX + pageKey,
                    CACHE_PREFIX + safeString(`title_${rawTitle}`),
                ];

                let cached = null;
                for (const ck of cacheKeys) {
                    const c = this.getCache(ck);
                    if (c) { cached = c; break; }
                }

                if (cached && this._validateCache(cached, rawTitle, cleanTitle, titleNorm, pageUrl, pornDbSceneId)) {
                    this.setCache(CACHE_PREFIX + pageKey, this._enrichCacheData(cached, rawTitle, cleanTitle, titleNorm, pageUrl, pornDbSceneId));
                    this.renderMedia(panel, cached);
                    return;
                }

                // 缓存迁移（旧 key → 新 key）
                const allKeys = typeof GM_listValues === 'function' ? GM_listValues().filter(k => k.startsWith(CACHE_PREFIX)) : [];
                for (const ck of allKeys) {
                    if (cacheKeys.includes(ck)) continue;
                    const c = this.getCache(ck);
                    if (!c) continue;
                    if (this._validateCache(c, rawTitle, cleanTitle, titleNorm, pageUrl, pornDbSceneId) ||
                        this._weakValidateCache(c, cleanTitle, titleNorm)) {
                        const enriched = this._enrichCacheData(c, rawTitle, cleanTitle, titleNorm, pageUrl, pornDbSceneId);
                        this._saveToAllKeys(enriched);
                        this.renderMedia(panel, c);
                        return;
                    }
                }

                // 搜索 DATA18
                const details = { titlePart: rawTitle, cleanTitle, pageMeta };
                const media = await this.findMedia(details);
                if (!media) {
                    // When the title+studio keywords fail, try actor-based search
                    // as a fallback. Single-word titles like "Audition" get too
                    // many results from Data18 live.php and the correct scene may
                    // not appear in the first N pages. Actor names narrow it down.
                    const actors = this.getPornDbSceneActors(doc);
                    if (actors.length) {
                        this.debug("title search failed, trying actor search", actors);
                        // First try each actor name standalone — Data18 returns a
                        // /name/ page which lists all their scenes (now handled by
                        // parseSearchResults + _fetchScenesFromNamePage).
                        for (const actor of actors.slice(0, 3)) {
                            if (actor.length < 4) continue;
                            const actorDetails = { ...details, titlePart: actor, cleanTitle };
                            const actorMedia = await this.findMedia(actorDetails);
                            if (actorMedia) {
                                const cacheData = this._enrichCacheData(actorMedia, rawTitle, cleanTitle, titleNorm, pageUrl, pornDbSceneId);
                                this._saveToAllKeys(cacheData);
                                this.renderMedia(panel, actorMedia);
                                return;
                            }
                        }
                        // Then try "ActorName Title" combination
                        const actorKw = `${actors.slice(0, 2).join(' ')} ${cleanTitle}`;
                        const actorDetails = { ...details, titlePart: actorKw, cleanTitle };
                        const actorMedia = await this.findMedia(actorDetails);
                        if (actorMedia) {
                            const cacheData = this._enrichCacheData(actorMedia, rawTitle, cleanTitle, titleNorm, pageUrl, pornDbSceneId);
                            this._saveToAllKeys(cacheData);
                            this.renderMedia(panel, actorMedia);
                            return;
                        }
                    }
                    // Also try the movie/series name from the PornDB page if available
                    const movieName = this.getPornDbMovieName(doc);
                    if (movieName && movieName.length >= 3) {
                        this.debug("title search failed, trying movie name", movieName);
                        const movieDetails = { ...details, titlePart: movieName, cleanTitle: movieName };
                        const movieMedia = await this.findMedia(movieDetails);
                        if (movieMedia) {
                            const cacheData = this._enrichCacheData(movieMedia, rawTitle, cleanTitle, titleNorm, pageUrl, pornDbSceneId);
                            this._saveToAllKeys(cacheData);
                            this.renderMedia(panel, movieMedia);
                            return;
                        }
                    }
                    this.setStatus(panel, "Data18 未找到匹配影片");
                    const skel = panel.querySelector('.x-data18-skeleton-strip');
                    if (skel) skel.remove();
                    return;
                }

                const cacheData = this._enrichCacheData(media, rawTitle, cleanTitle, titleNorm, pageUrl, pornDbSceneId);
                this._saveToAllKeys(cacheData);
                this.renderMedia(panel, media);
            } catch (err) {
                console.warn("[PornData18Media] ensurePanel failed:", err);
            }
        },

        _saveToAllKeys(data) {
            const clean = data.cleanTitle || '';
            const pageUrl = data.pageUrl || '';
            const sceneId = data.pornDbSceneId || '';
            if (clean) this.setCache(CACHE_PREFIX + safeString(`title_${clean}`), data);
            if (pageUrl) this.setCache(CACHE_PREFIX + safeString(`url_${pageUrl}`), data);
            if (sceneId) this.setCache(CACHE_PREFIX + safeString(`scene_${sceneId}`), data);
        },

        _insertAnchor(doc, anchor) {
            const west = doc.querySelector('.x-west-wrap');
            const cover = doc.querySelector('.relative.flex.min-h-80');

            if (west && west.parentElement) {
                west.parentElement.insertBefore(anchor, west);
                this.debug("anchor position: before .x-west-wrap");
                return true;
            }

            if (cover && cover.parentElement) {
                cover.parentElement.insertBefore(anchor, cover.nextSibling);
                this.debug("anchor position: after cover");
                return true;
            }

            this.debug("anchor position: deferred (no cover or west)");
            return false;
        },

        _validateCache(cached, rawTitle, cleanTitle, titleNorm, pageUrl, pornDbSceneId) {
            if (!cached) return false;
            const cachedNorm = cached.titleNorm || '';
            const cachedUrl = cached.pageUrl || '';
            const cachedSceneId = cached.pornDbSceneId || '';
            if (cachedNorm && cachedNorm === titleNorm) return true;
            if (cachedUrl && cachedUrl === pageUrl) return true;
            if (cachedSceneId && cachedSceneId === pornDbSceneId) return true;
            return false;
        },

        _weakValidateCache(cached, cleanTitle, titleNorm) {
            if (!cached || !cleanTitle) return false;
            const searchTitle = cached.searchTitle || cached.keyword || '';
            if (!searchTitle) return false;
            const searchNorm = this.normalizeTitle(searchTitle);
            if (!searchNorm) return false;
            if (searchNorm === titleNorm) return true;
            const words = titleNorm.split(/\s+/).filter(w => w.length > 2);
            if (!words.length) return false;
            return words.filter(w => searchNorm.includes(w)).length / words.length >= 0.85;
        },

        _enrichCacheData(data, rawTitle, cleanTitle, titleNorm, pageUrl, pornDbSceneId) {
            return {
                ...data,
                rawTitle,
                cleanTitle,
                titleNorm: titleNorm || this.normalizeTitle(cleanTitle || ''),
                pageUrl,
                pornDbSceneId,
                cacheVersion: 2,
            };
        },

        isScenePage(doc) {
            const href = (doc.location && doc.location.href) || location.href;
            return /\/scenes\//.test(href);
        },

        createPanel(doc, key) {
            const panel = doc.createElement("section");
            panel.className = "x-data18-wrap";
            panel.dataset.key = key;
            panel.innerHTML = `
                <div class="x-data18-head">
                    <div class="x-data18-head-left">
                        <svg class="x-data18-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2" ry="2"/></svg>
                        <span class="x-data18-title">Data18 预览</span>
                    </div>
                    <span class="x-data18-status">准备搜索...</span>
                </div>
                <div class="x-data18-body">
                    <div class="x-data18-skeleton-strip"><div class="x-data18-skeleton-card"></div><div class="x-data18-skeleton-card"></div><div class="x-data18-skeleton-card"></div></div>
                </div>
                <style>
                .x-data18-wrap{background:#fff;border:1px solid #e4e7ed;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.03);margin:8px 0 20px}
                .x-data18-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px 8px}
                .x-data18-head-left{display:flex;align-items:center;gap:8px}
                .x-data18-icon{width:18px;height:18px;flex-shrink:0;color:#7b5ea7}
                .x-data18-title{font-size:14px;font-weight:700;color:#303133}
                .x-data18-title::before{content:'';display:inline-block;width:3px;height:14px;background:#7b5ea7;border-radius:2px;margin-right:8px;vertical-align:-2px}
                .x-data18-status{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:500;padding:2px 10px;border-radius:999px;background:#f4f0fa;color:#7b5ea7}
                .x-data18-body{padding:0 16px 14px}
                .x-data18-media-strip{display:flex;gap:10px;overflow-x:auto;overflow-y:hidden;padding:4px 2px 6px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}
                .x-data18-media-strip::-webkit-scrollbar{height:4px}
                .x-data18-media-strip::-webkit-scrollbar-thumb{border-radius:999px;background:rgba(0,0,0,0.12)}
                .x-data18-media-strip::-webkit-scrollbar-track{background:transparent}
                .x-data18-media-card{position:relative;flex:0 0 auto;width:200px;height:120px;border-radius:8px;overflow:hidden;background:#000;cursor:zoom-in;scroll-snap-align:start;border:2px solid transparent;transition:border-color 0.2s,transform 0.2s,box-shadow 0.2s;padding:0;display:block}
                .x-data18-media-card:hover{border-color:#7b5ea7;transform:translateY(-2px);box-shadow:0 6px 20px rgba(123,94,167,0.18)}
                .x-data18-thumb-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);color:rgba(255,255,255,0.12);font-size:28px}
                .x-data18-thumb-video,.x-data18-thumb-img{display:block;width:100%;height:100%;object-fit:cover}
                .x-data18-thumb-video::-webkit-media-controls{display:none!important}
                .x-data18-play-badge{position:absolute;left:50%;top:50%;width:42px;height:42px;transform:translate(-50%,-50%);border-radius:999px;display:flex;align-items:center;justify-content:center;background:rgba(123,94,167,0.88);color:#fff;pointer-events:none;transition:transform 0.2s,background 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.3)}
                .x-data18-play-badge svg{width:20px;height:20px;margin-left:2px;color:#fff}
                .x-data18-media-card:hover .x-data18-play-badge{background:rgba(123,94,167,1);transform:translate(-50%,-50%) scale(1.08)}
                .x-data18-card-badge{position:absolute;right:6px;bottom:6px;background:rgba(0,0,0,0.65);color:#fff;font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;pointer-events:none;line-height:1.4}
                .x-data18-lightbox-loading{color:white;text-align:center;padding:40px;font-size:14px}
                .x-data18-lightbox{position:fixed;inset:0;z-index:9999999;display:flex;align-items:center;justify-content:center;padding:60px 60px 28px;background:rgba(0,0,0,0.88)}
                .x-data18-lightbox-close{position:absolute;top:16px;right:20px;z-index:10000000;width:38px;height:38px;border:0;border-radius:999px;font-size:24px;color:#fff;background:rgba(255,255,255,0.15);cursor:pointer;line-height:38px;text-align:center}
                .x-data18-lightbox-close:hover,.x-data18-lightbox-prev:hover,.x-data18-lightbox-next:hover{background:rgba(255,255,255,0.3)!important}
                .x-data18-lightbox-inner{max-width:min(96vw,1280px);max-height:92vh;display:flex;align-items:center;justify-content:center}
                .x-data18-lightbox-img{max-width:96vw;max-height:92vh;object-fit:contain;border-radius:8px}
                .x-data18-lightbox-video{max-width:96vw;max-height:92vh;background:#000;border-radius:8px}
                @keyframes x-data18-shimmer{0%{background-position:-200px 0}100%{background-position:calc(200px + 100%) 0}}
                .x-data18-skeleton-strip{display:flex;gap:10px}
                .x-data18-skeleton-card{flex:0 0 auto;width:200px;height:120px;border-radius:8px;background:#e8e8e8;position:relative;overflow:hidden}
                .x-data18-skeleton-card::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent);background-size:200px 100%;animation:x-data18-shimmer 1.5s infinite}
                </style>
            `;
            return panel;
        },

        setStatus(panel, text) {
            const node = panel && panel.querySelector ? panel.querySelector(".x-data18-status") : null;
            if (node) node.textContent = text;
        },

        // Remove any studio+date prefix from the title before keyword generation.
        // PornDB titles come in several formats:
        //   "Studio.01.05.24. Title" / "Studio.01.05.24 Title"  (dot-sep, optional trailing dot)
        //   "Studio 01 05 24 Title"  (space-sep)
        //   "Studio - 01.05.24 - Title"  (dash-sep)
        //   "Studio - Title"  (dash-sep with no date — use pageMeta.studio to strip)
        // The original regexes failed when the date portion was followed by "."
        // instead of a space (e.g. "Studio.06.15.24.Title" or "EvilAngel.07.12.26.Scene 4").
        // We also strip "Scene N from/from/suffix" prefixes that add noise to search keywords.
        cleanSearchTitle(raw, pageMeta) {
            let title = safeString(raw || "");
            const studioName = safeString(pageMeta && pageMeta.studio || "");
            // Studio.xx.xx.xx. or Studio.xx.xx.xx (optional trailing dot, then whitespace)
            title = title.replace(/^[\w\s]+\s*\.\s*\d{2}\.\d{2}\.\d{2}\.*\s+/, "");
            // Studio xx xx xx
            title = title.replace(/^[\w\s]+\s+\d{2}\s+\d{2}\s+\d{2}\s+/, "");
            // Studio - xx.xx.xx - or Studio - xx.xx.xx.xx -
            title = title.replace(/^[\w\s]+\s*-\s*\d{2}\.\d{2}\.\d{2}(?:\.\d{2})?\s*-\s*/, "");
            // Trailing (year) or year
            title = title.replace(/\s*\(\d{4}\)\s*$/, "");
            title = title.replace(/\s+\d{4}$/, "");
            // Drop leading "Scene N from " or "Scene N -" so search keywords
            // are just the meaningful title words (e.g. "Double Penetration Fixation 6").
            // Only strip when there are more words after the "Scene N" part.
            const scenePrefix = title.match(/^Scene\s+\d+\s+(?:from\s+|-\s*)/i);
            if (scenePrefix) {
                const rest = title.substring(scenePrefix[0].length).trim();
                if (rest.length >= 5) title = rest;
            }
            // Strip a known studio prefix when the studio was extracted from PornDB metadata.
            // PornDB uses both "Deeper - Audition" and "Deeper Audition" forms.
            if (studioName && studioName.length >= 4) {
                const esc = studioName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp(`^${esc}(?:\\s*-\\s*|\\s+)`, 'i');
                title = title.replace(re, '');
            }
            return title.trim();
        },

        getSearchTitle(details) {
            const raw = safeString(details && details.titlePart);
            return details && details.cleanTitle ? details.cleanTitle : this.cleanSearchTitle(raw);
        },

        // Generate progressively shorter keyword queries (longest first).
        // Stop words like "scene", "from", "the", "and", "in", "with" are skipped
        // when they appear as leading/trailing filler so the first keyword is the
        // most meaningful phrase, not "Scene 4 from Double Penetration Fixation".
        buildSearchKeywords(details) {
            const raw = safeString(details && details.titlePart);
            const clean = this.cleanSearchTitle(raw);
            const keywords = [];

            // Build keywords from the cleaned title: longest first, then progressively
            // shorter tails. This makes "Double Penetration Fixation 6" the first try
            // rather than "Scene 4 from Double Penetration Fixation 6".
            const words = clean.split(/\s+/).filter(Boolean);
            for (let n = words.length; n >= 2; n--) {
                const phrase = words.slice(0, n).join(" ");
                if (phrase.length >= 3) keywords.push(phrase);
            }

            // Also emit tail-keywords ("Penetration Fixation 6", "Fixation 6") in
            // case the head words are still noise the cleaning didn't strip.
            const tailKeywords = [];
            for (let start = 1; start < words.length - 1; start++) {
                const phrase = words.slice(start).join(" ");
                if (phrase.length >= 3 && !keywords.includes(phrase))
                    tailKeywords.push(phrase);
            }
            // Insert tail keywords after the first (longest) keyword so they get
            // tried before the very short prefixes.
            keywords.splice(1, 0, ...tailKeywords);

            // Also try the raw title (with studio prefix stripped) as a fallback
            if (raw.length >= 3 && raw !== clean) {
                keywords.splice(1, 0, raw);
            }

            return [...new Set(keywords)].filter(k => k.length >= 3);
        },

        // Data18 key+key2 encoding: encodeURI, clean \s+, strip non-[a-z0-9%].
        // Uses encodeURI (NOT encodeURIComponent) to match the site's actual code.
        _encodeSearchKey(raw) {
            const enc = encodeURI(String(raw || ''));
            const cleaned = enc.replace(/\s+/g, '');
            return cleaned.replace(/[^a-z0-9%]/gi, '');
        },

        // Data18 keyfull encoding: lowercase, spaces → --, strip to [a-z0-9"*-]
        _encodeSearchKeyfull(raw) {
            return String(raw || '').toLowerCase()
                .replace(/ /g, '--')
                .replace(/[^a-z0-9"*-]/gi, '');
        },

        // Build the search URL using manual concatenation of pre-encoded values,
        // matching Data18's own JS pattern. Do NOT use URLSearchParams — it would
        // double-encode the % signs already present in key/key2/keyfull.
        buildSearchUrl(keyword, level = 1, page = 1) {
            const clean = safeString(keyword);
            let t;
            if (level === 1) t = "0";
            else if (level === 2) t = "6";
            else t = "0";

            let queryKw = clean;

            if (level >= 3) {
                const shortKw = clean.split(/\s+/).slice(0, 4).join(" ");
                if (shortKw === clean || shortKw.length < 5) return null;
                queryKw = shortKw;
            }

            const keyEnc = this._encodeSearchKey(queryKw);
            const keyfullEnc = this._encodeSearchKeyfull(queryKw);

            if (page > 1) {
                return `${DATA18_ORIGIN}/sys/live.php?live=1&key=${keyEnc}&key2=${keyEnc}&keyfull=${keyfullEnc}&t=${t}&b=1&change=1&next=1&page=1`;
            }

            return `${DATA18_ORIGIN}/sys/live.php?index=&key=${keyEnc}&key2=${keyEnc}&keyfull=${keyfullEnc}&t=${t}&b=1&page=1`;
        },

        _advanceSearchPage(page) {
            return this.fetchFromData18(
                `${DATA18_ORIGIN}/sys/user.php?pagesearch=${page}`,
                { referer: `${DATA18_ORIGIN}/`, accept: "text/html, */*; q=0.01", ajax: true }
            );
        },

        async fetchFromData18(url, options = {}) {
            const {
                method = "GET", referer = `${DATA18_ORIGIN}/`,
                accept = "text/html, */*; q=0.01", ajax = false,
                returnResponse = false, timeout = 20000
            } = options;

            if (!this._data18Agreed) {
                await this._passAgeGate();
            }

            return new Promise((resolve, reject) => {
                const headers = {
                    "User-Agent": navigator.userAgent,
                    "Accept": accept,
                    "Referer": referer
                };
                if (ajax) headers["X-Requested-With"] = "XMLHttpRequest";

                GM_xmlhttpRequest({
                    method, url, headers, timeout,
                    withCredentials: true, anonymous: false,
                    onload: (res) => {
                        const text = res.responseText || '';
                        if (text && this._isAgeGatePage(text) && !this._retrying) {
                            this._retrying = true;
                            this._data18Agreed = false;
                            this.debug("age gate detected, retrying");
                            this._passAgeGate().then(() => {
                                this._retrying = false;
                                this.fetchFromData18(url, options).then(resolve).catch(reject);
                            });
                            return;
                        }
                        this._retrying = false;
                        if (returnResponse) { resolve(res); return; }
                        if (res.status >= 200 && res.status < 300) {
                            resolve(text);
                        } else {
                            reject(new Error(`Data18 HTTP Error: ${res.status}`));
                        }
                    },
                    onerror: () => reject(new Error("Data18 request error")),
                    ontimeout: () => reject(new Error("Data18 request timeout"))
                });
            });
        },

        _isAgeGatePage(text) {
            return /(?:ADULTS\s+ONLY|age.?restricted|age.verification|captcha|I\s+am\s+(?:over|at\s+least)\s+\d+)/i.test(text)
                || (text.length < 200 && /(?:enter|confirm|verify)\s+your\s+(?:age|birth)/i.test(text));
        },

        async _passAgeGate() {
            await this._cookieFetch(DATA18_ORIGIN);
            await this._cookieFetch(`${DATA18_ORIGIN}/sys/captcha`);
            this._data18Agreed = true;
        },

        _cookieFetch(url) {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: "GET", url,
                    headers: { "User-Agent": navigator.userAgent, "Referer": DATA18_ORIGIN },
                    timeout: 15000, withCredentials: true, anonymous: false,
                    onload: () => resolve(), onerror: () => resolve(), ontimeout: () => resolve()
                });
            });
        },

        async findMedia(details) {
            const keywords = this.buildSearchKeywords(details);
            this.debug("search keywords", keywords);
            const visitedSceneIds = new Set();
            const pageMeta = details.pageMeta || {};

            for (const keyword of keywords) {
                for (let level = 1; level <= 3; level++) {
                    try {
                        const allResults = [];
                        // Data18 stores its pagination cursor in the session. Advance it
                        // for every batch; reusing pagesearch=2 repeats the same five rows.
                        for (let page = 1; page <= SEARCH_PAGE_MAX; page++) {
                            if (page > 1) {
                                try { await this._advanceSearchPage(page); } catch (e) {
                                    this.debug(`advanceSearchPage failed for page ${page}`, e);
                                    break;
                                }
                            }

                            const searchUrl = this.buildSearchUrl(keyword, level, page);
                            if (!searchUrl) break;
                            this.debug(`search url (level ${level}, page ${page})`, searchUrl);

                            const searchHtml = await this.fetchFromData18(searchUrl, {
                                referer: `${DATA18_ORIGIN}/`,
                                accept: "text/html, */*; q=0.01",
                                ajax: true
                            });

                            if (!searchHtml || searchHtml.length < 50) break;
                            if (this._isAgeGatePage(searchHtml)) {
                                this.debug("age gate page returned");
                                if (page === 1) this.setStatus(this._panel || document.querySelector('.x-data18-wrap'), "Data18 年龄验证未通过");
                                break;
                            }

                            const pageResults = this.parseSearchResults(searchHtml, pageMeta);
                            if (!pageResults.length) break;

                            const newResults = pageResults.filter(r => !visitedSceneIds.has(r.sceneId));
                            newResults.forEach(r => visitedSceneIds.add(r.sceneId));
                            // A repeated full page means the server cursor did not advance.
                            if (!newResults.length) break;
                            allResults.push(...newResults);
                            if (pageResults.length < 5) break;
                        }

                        this.debug(`search results (level ${level})`, { count: allResults.length, items: allResults });

                        if (!allResults.length) continue;

                        const sorted = this._scoreSearchResults(allResults, pageMeta);
                        const expectedTitle = this.normalizeTitle(details.cleanTitle || details.titlePart || '');
                        const exactTitleCount = expectedTitle
                            ? sorted.filter(item => this.normalizeTitle(item.text) === expectedTitle).length
                            : 0;
                        // The search endpoint can return only studio cards for a
                        // short title.  Do not walk hundreds of unrelated pages:
                        // switch immediately to that studio's own scene index.
                        if (!exactTitleCount && pageMeta.studio) {
                            const studioResult = await this._findMediaFromStudio(pageMeta.studio, details);
                            if (studioResult) return studioResult;
                        }
                        for (const best of sorted) {
                            // Date/studio are a disambiguator only when Data18 has
                            // several records with the same title.  A unique title
                            // must not be discarded merely because one site omits
                            // or labels a metadata field differently.
                            best._requiresExactMeta = exactTitleCount > 1
                                && this.normalizeTitle(best.text) === expectedTitle;
                            this.debug("trying result", { url: best.url, text: best.text, sceneId: best.sceneId, metaScore: best._metaScore });
                            const result = await this._fetchDetailAndMedia(best, details);
                            if (result) return result;
                        }
                    } catch (err) {
                        console.warn(`[PornData18Media] search failed:`, err?.message || err);
                    }
                }
            }
            // Data18's free-text endpoint often returns a studio card instead of
            // old scenes ("Audition" under Deeper is one example).  Search the
            // PornDB studio's dedicated scene index as a final, scoped fallback.
            return this._findMediaFromStudio(pageMeta.studio, details);
        },

        _studioSlug(studio) {
            return safeString(studio).toLowerCase()
                .replace(/&/g, ' and ')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
        },

        _extractSceneLinks(html) {
            const dom = new DOMParser().parseFromString(this.normalizeHtml(html), 'text/html');
            const seen = new Set();
            const scenes = [];
            for (const a of dom.querySelectorAll('a[href*="/scenes/"]')) {
                const href = a.getAttribute('href') || '';
                if (/#trailer|#image|\/store\/scenes\//i.test(href)) continue;
                const sid = href.match(/\/(?:g\/)?scenes\/(\d{3,})(?:[\/?#\s"'<>._-]|$)/);
                if (!sid || seen.has(sid[1])) continue;
                seen.add(sid[1]);
                const img = a.querySelector('img');
                const text = safeString(a.getAttribute('title') || a.textContent
                    || (img && (img.getAttribute('alt') || img.getAttribute('title'))) || '');
                scenes.push({
                    url: new URL(href, DATA18_ORIGIN).href, sceneId: sid[1], text,
                    _resultDate: '', _resultStudio: '', _resultStudioId: ''
                });
            }
            return scenes;
        },

        async _findMediaFromStudio(studio, details) {
            const slug = this._studioSlug(studio);
            const expectedTitle = this.normalizeTitle(details.cleanTitle || details.titlePart || '');
            if (!slug || !expectedTitle) return null;

            const studioUrl = `${DATA18_ORIGIN}/studios/${slug}/scenes`;
            try {
                const firstHtml = await this.fetchFromData18(studioUrl, {
                    referer: `${DATA18_ORIGIN}/`,
                    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                });
                // Do not regex the raw HTML: the stylesheet contains a class
                // named `sprite-icon-scenes-14`, which was incorrectly read as
                // a 14-scene studio and stopped the scan on page 1.
                const firstDom = new DOMParser().parseFromString(this.normalizeHtml(firstHtml), 'text/html');
                const totalMatch = [...firstDom.querySelectorAll('a')]
                    .map(link => safeString(link.textContent).match(/^Scenes\s*-\s*(\d+)$/i))
                    .find(Boolean)
                    || safeString(firstDom.body && firstDom.body.textContent).match(/Scenes\s*-\s*(\d+)/i);
                const total = totalMatch ? Number(totalMatch[1]) : 0;
                const pageCount = total ? Math.ceil(total / 30) : 1;
                const allMatches = [];

                for (let page = 1; page <= pageCount; page++) {
                    const html = page === 1 ? firstHtml : await this.fetchFromData18(
                        `${DATA18_ORIGIN}/sys/page.php?t=3&b=2&o=0&html=${encodeURIComponent(slug)}&html2=&total=${total}&doquery=1&spage=${page}&dopage=1`,
                        { referer: studioUrl, accept: 'text/html, */*; q=0.01', ajax: true }
                    );
                    const matches = this._extractSceneLinks(html)
                        .filter(scene => this.normalizeTitle(scene.text) === expectedTitle);
                    allMatches.push(...matches);
                }

                this.debug('studio fallback matches', {
                    studio, slug, expectedTitle, count: allMatches.length
                });
                for (const scene of allMatches) {
                    scene._requiresExactMeta = allMatches.length > 1;
                    const result = await this._fetchDetailAndMedia(scene, details);
                    if (result) return result;
                }
            } catch (err) {
                this.debug('studio fallback failed', { studio, slug, err: err?.message || err });
            }
            return null;
        },

        _scoreSearchResults(results, pageMeta) {
            if (!pageMeta || (!pageMeta.date && !pageMeta.studio)) return results;
            // Prioritize results whose extracted metadata matches the PornDB page exactly.
            // These scores ensure correct results sort to the top; final validation happens
            // in _fetchDetailAndMedia via _extractDetailPageMeta.
            return results.map(r => {
                    let score = 0;
                    if (r._resultDate && pageMeta.date && r._resultDate === pageMeta.date) score += 50;
                    if (r._resultStudio && pageMeta.studio && r._resultStudio === pageMeta.studio) score += 50;
                    r._metaScore = score;
                    return r;
                })
                .sort((a, b) => b._metaScore - a._metaScore);
        },

        // Symmetric two-way word overlap score. Strips punctuation from both sides
        // so "Wanna Chill?" and "Wanna-Chill" match. Also handles compound words:
        // "step-dad" vs "stepdad" → both split to ["step","dad"] after stripping.
        // When one side is a single word (e.g. "audition"), check if that word
        // appears anywhere in the other string (case-insensitive substring match).
        _calcSimilarity(aNorm, bNorm) {
            if (!aNorm || !bNorm) return 0;
            if (aNorm === bNorm) return 1;

            const stripPunct = (s) => s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
            const a = stripPunct(aNorm);
            const b = stripPunct(bNorm);
            if (a === b) return 1;

            // Single-word titles: check raw substring presence (e.g. "audition" in "scene 1 audition")
            const aWords = a.split(/\s+/).filter(w => w.length > 2);
            const bWords = b.split(/\s+/).filter(w => w.length > 2);
            if (aWords.length === 1 && bNorm.toLowerCase().includes(aWords[0].toLowerCase())) return 1;
            if (bWords.length === 1 && aNorm.toLowerCase().includes(bWords[0].toLowerCase())) return 1;

            if (!aWords.length || !bWords.length) return 0;

            const joinWords = (s) => s.replace(/\s+/g, "");
            const aJoined = joinWords(a);
            const bJoined = joinWords(b);
            if (aJoined === bJoined) return 1;

            // Count words that appear in the other string (after stripping punct)
            const aInB = aWords.filter(w => b.includes(w)).length / aWords.length;
            const bInA = bWords.filter(w => a.includes(w)).length / bWords.length;

            // Also check joined forms for compound-word matches
            const aJoinedInB = aWords.filter(w => bJoined.includes(w)).length / aWords.length;
            const bJoinedInA = bWords.filter(w => aJoined.includes(w)).length / bWords.length;

            return Math.max((aInB + bInA) / 2, (aJoinedInB + bJoinedInA) / 2);
        },

        async _resolveMovieToScene(movieResult, details) {
            // When a search result points to a /movies/ page, fetch that page and
            // pick the single scene whose title best matches the PornDB search
            // title.  Returns a {url, sceneId, text} result suitable for
            // _fetchDetailAndMedia, or null when no scene is found.
            try {
                const html = await this.fetchFromData18(movieResult.url, {
                    referer: `${DATA18_ORIGIN}/`,
                    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    ajax: false
                });
                if (!html || html.length < 200) return null;

                const dom = new DOMParser().parseFromString(this.normalizeHtml(html), "text/html");
                const links = dom.querySelectorAll('a[href*="/scenes/"]');
                const seen = new Set();
                const candidates = [];

                for (const a of links) {
                    const href = a.getAttribute('href');
                    if (!href || /#trailer|#image|store/i.test(href)) continue;

                    // Prefer the title attribute (usually the scene name) over link
                    // text which may be "Scene 1 Actor1 Actor2" on movie pages.
                    let text = a.getAttribute('title') || a.textContent.trim();
                    if (text.length < 3 && a.querySelector('img')) {
                        const img = a.querySelector('img');
                        text = (img && (img.getAttribute('alt') || img.getAttribute('title'))) || text;
                    }

                    const sid = href.match(/\/(?:g\/)?scenes\/(\d{3,})(?:[\/?#\s"'<>._-]|$)/);
                    if (!sid || seen.has(sid[1])) continue;
                    seen.add(sid[1]);

                    candidates.push({
                        url: new URL(href, DATA18_ORIGIN).href,
                        sceneId: sid[1],
                        text,
                        _resultDate: '', _resultStudio: '',
                        _isMovieResult: true,
                        _fromMoviePage: true,
                    });
                }

                if (!candidates.length) return null;

                // Score each candidate's title against the PornDB search title
                const searchNorm = this.normalizeTitle(details.cleanTitle || details.titlePart || '');
                const scored = candidates.map(c => ({
                    ...c,
                    _metaScore: this._calcSimilarity(
                        searchNorm,
                        this.normalizeTitle(c.text)
                    ),
                })).sort((a, b) => b._metaScore - a._metaScore);

                return scored[0]._metaScore >= 0.1 ? scored[0] : candidates[0];
            } catch (e) {
                this.debug(`_resolveMovieToScene failed for ${movieResult.url}`, e);
                return null;
            }
        },

        // When a search result is a /movies/ link (the scene was released as part
        // of a movie), fetch the movie page and look for a scene whose title + date
        // matches the PornDB search query. Returns the same shape as parseSearchResults
        // so _fetchDetailAndMedia works unchanged.
        async _fetchScenesFromMoviePage(movieUrl, details) {
            try {
                const html = await this.fetchFromData18(movieUrl, {
                    referer: `${DATA18_ORIGIN}/`,
                    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    ajax: false
                });
                if (!html || html.length < 200) return [];

                const dom = new DOMParser().parseFromString(this.normalizeHtml(html), "text/html");
                const sceneLinks = dom.querySelectorAll('a[href*="/scenes/"]');
                const seen = new Set();
                const scenes = [];

                for (const a of sceneLinks) {
                    const href = a.getAttribute('href');
                    if (!href) continue;
                    if (/#trailer|#image/i.test(href)) continue;
                    if (/\/g\/store\/scenes\//i.test(href)) continue;

                    const sid = href.match(/\/(?:g\/)?scenes\/(\d{3,})(?:[\/?#\s"'<>._-]|$)/);
                    if (!sid || seen.has(sid[1])) continue;
                    seen.add(sid[1]);

                    // Use the link text; fall back to alt/title of any child image
                    let text = a.textContent.trim();
                    if (text.length < 3) {
                        const img = a.querySelector('img');
                        text = (img && (img.getAttribute('alt') || img.getAttribute('title'))) || text;
                    }

                    scenes.push({
                        url: new URL(href, DATA18_ORIGIN).href,
                        sceneId: sid[1],
                        text: text || a.getAttribute('title') || '',
                        _resultDate: '', _resultStudio: '', _resultStudioId: '',
                        _isMovieResult: true,
                        _fromMoviePage: true,
                    });
                }

                if (scenes.length === 0) return [];

                // Score the scenes against the PornDB metadata
                const pageMeta = details.pageMeta || {};
                const scored = this._scoreSearchResults(scenes, pageMeta);
                this.debug(`movie page scenes (${movieUrl})`, { count: scored.length });
                return scored;
            } catch (e) {
                this.debug(`_fetchScenesFromMoviePage failed for ${movieUrl}`, e);
                return [];
            }
        },

        // Fetch a /name/ page and extract individual scene links, scored against
        // the PornDB metadata. Works the same way as _fetchScenesFromMoviePage.
        async _fetchScenesFromNamePage(nameUrl, details) {
            try {
                const html = await this.fetchFromData18(nameUrl, {
                    referer: `${DATA18_ORIGIN}/`,
                    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    ajax: false
                });
                if (!html || html.length < 200) return [];

                const dom = new DOMParser().parseFromString(this.normalizeHtml(html), "text/html");
                const links = dom.querySelectorAll('a[href*="/scenes/"]');
                const seen = new Set();
                const scenes = [];

                for (const a of links) {
                    const href = a.getAttribute('href');
                    if (!href) continue;
                    if (/#trailer|#image/i.test(href)) continue;
                    if (/\/g\/store\/scenes\//i.test(href)) continue;

                    const sid = href.match(/\/(?:g\/)?scenes\/(\d{3,})(?:[\/?#\s"'<>._-]|$)/);
                    if (!sid || seen.has(sid[1])) continue;
                    seen.add(sid[1]);

                    let text = a.getAttribute('title') || a.textContent.trim();
                    if (text.length < 3) {
                        const img = a.querySelector('img');
                        text = (img && (img.getAttribute('alt') || img.getAttribute('title'))) || text;
                    }

                    scenes.push({
                        url: new URL(href, DATA18_ORIGIN).href,
                        sceneId: sid[1],
                        text: text || '',
                        _resultDate: '', _resultStudio: '', _resultStudioId: '',
                        _isMovieResult: true,
                        _fromMoviePage: true,
                    });
                }

                if (scenes.length === 0) return [];

                const pageMeta = details.pageMeta || {};
                const scored = this._scoreSearchResults(scenes, pageMeta);
                this.debug(`name page scenes (${nameUrl})`, { count: scored.length });
                return scored;
            } catch (e) {
                this.debug(`_fetchScenesFromNamePage failed for ${nameUrl}`, e);
                return [];
            }
        },

        async _fetchDetailAndMedia(best, details) {
            // If the search result points to a /movies/ page instead of a /scenes/
            // page, first collect individual scenes from the movie page.
            const isMovieUrl = /\/movies\//i.test(best.url);
            if (isMovieUrl && best._isMovieResult) {
                this.debug("expanding movie result to scenes", best.url);
                // Try the smarter single-scene resolver first, then fall back to
                // the bulk collector that tries every scene.
                const resolved = await this._resolveMovieToScene(best, details);
                if (resolved) {
                    this.debug("resolved movie to scene via similarity", { url: resolved.url, sceneId: resolved.sceneId, text: resolved.text });
                    const result = await this._fetchDetailAndMedia(resolved, details);
                    if (result) return result;
                }
                const movieScenes = await this._fetchScenesFromMoviePage(best.url, details);
                for (const scene of movieScenes) {
                    this.debug("trying movie scene (bulk)", { url: scene.url, sceneId: scene.sceneId });
                    const result = await this._fetchDetailAndMedia(scene, details);
                    if (result) return result;
                }
                return null;
            }

            // If the search result is a /name/ page, fetch it and expand to scenes.
            const isNameUrl = /\/name\//i.test(best.url);
            if (isNameUrl && best._isNameResult) {
                this.debug("expanding name result to scenes", best.url);
                const nameScenes = await this._fetchScenesFromNamePage(best.url, details);
                for (const scene of nameScenes) {
                    this.debug("trying name scene", { url: scene.url, sceneId: scene.sceneId });
                    const result = await this._fetchDetailAndMedia(scene, details);
                    if (result) return result;
                }
                return null;
            }

            const detailHtml = await this.fetchFromData18(best.url, {
                referer: `${DATA18_ORIGIN}/`,
                accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                ajax: false
            });
            if (!detailHtml || detailHtml.length < 100) return null;

            const dd = new DOMParser().parseFromString(this.normalizeHtml(detailHtml), 'text/html');
            const d18h1 = dd.querySelector('h1');
            const d18Title = d18h1 ? d18h1.textContent.trim() : '';
            const cleanNorm = this.normalizeTitle(details.cleanTitle || '');
            const d18Norm = this.normalizeTitle(d18Title);
            const sim = this._calcSimilarity(cleanNorm, d18Norm);
            this.debug("detail title check", { d18Title, sim });

            // When the search result came from keyword matching and the titles are
            // only partially overlapping, still accept it — the search engine already
            // narrowed the result set and a low sim means different naming conventions,
            // not a wrong match.
            const simThreshold = (best._isMovieResult || best._fromMoviePage) ? 0.1 : 0.65;
            if (d18Title && sim < simThreshold) {
                this.debug("rejected detail: title mismatch");
                return null;
            }

            const pageMeta = details.pageMeta || {};
            if (pageMeta.date || pageMeta.studio) {
                const d18Meta = this._extractDetailPageMeta(dd);
                this.debug("detail meta check", { d18Meta, pageMeta });
                const strictMeta = !!best._requiresExactMeta;
                if (pageMeta.date && (strictMeta ? d18Meta.date !== pageMeta.date : (d18Meta.date && d18Meta.date !== pageMeta.date))) {
                    this.debug("rejected detail: date mismatch");
                    return null;
                }
                if (pageMeta.studio && (strictMeta ? d18Meta.studio !== pageMeta.studio : (d18Meta.studio && d18Meta.studio !== pageMeta.studio))) {
                    this.debug("rejected detail: studio mismatch");
                    return null;
                }
            }

            const media = await this.collectMediaFromDetail(detailHtml, best.url, best.sceneId);
            if (media.videoUrl || media.images.length) {
                return {
                    keyword: 'search', searchTitle: this.getSearchTitle(details),
                    sourceUrl: best.url, sceneId: best.sceneId,
                    mediaId: media.mediaId, videoUrl: media.videoUrl, images: media.images
                };
            }
            return null;
        },

        _extractDetailPageMeta(doc) {
            const meta = { date: '', studio: '' };
            try {
                const dateContainers = doc.querySelectorAll('div.whitespace-nowrap');
                for (const el of dateContainers) {
                    const txt = el.textContent.trim().replace(/^-\s*/, '');
                    const m = txt.match(/([a-zA-Z]{3,})\s+(\d{1,2}),\s+(\d{4})/);
                    if (m) { meta.date = this._normalizeDateStr(m[0]); break; }
                }
                if (!meta.date) {
                    const m = doc.body.textContent.match(/([a-zA-Z]{3,})\s+(\d{1,2}),\s+(\d{4})/);
                    if (m) meta.date = this._normalizeDateStr(m[0]);
                }
                const siteNode = doc.querySelector('a[href*="/sites/"]') || doc.querySelector('a[href*="/studios/"]') || doc.querySelector('a[href*="/networks/"]');
                if (siteNode) {
                    const text = Array.from(siteNode.childNodes)
                        .filter(n => n.nodeType === Node.TEXT_NODE)
                        .map(n => n.textContent.trim())
                        .join('') || siteNode.textContent.trim();
                    if (text) meta.studio = this._normalizeStudioName(text);
                }
                if (!meta.studio) {
                    for (const el of doc.querySelectorAll('div.whitespace-nowrap')) {
                        const txt = el.textContent.trim();
                        if (meta.date && txt.includes('-')) {
                            const candidate = txt.split('-')[0].trim();
                            if (candidate && candidate.length < 40) {
                                meta.studio = this._normalizeStudioName(candidate);
                                break;
                            }
                        }
                    }
                }
            } catch (e) {}
            return meta;
        },

        parseSearchResults(html, pageMeta = {}) {
            if (!html || html.length < 50) return [];
            const source = this.normalizeHtml(html);
            const seen = new Set();
            const results = [];

            // Parse DOM to extract structured metadata from each result card.
            // Each result is an <a id="pslinkN"> containing a <div class="searchdivs">
            // with <span class="gen11"> (date + <i>studio</i>) and <p class="gen12 bold"> (title).
            try {
                const dom = new DOMParser().parseFromString(source, "text/html");
                const cards = dom.querySelectorAll('div.searchdivs');
                cards.forEach(card => {
                    // Data18 search returns /scenes/, /movies/, and /name/ links.
                    // An actor search like "Mia Melano" returns /name/ links which list
                    // the actor's scenes. Fetch the /name/ page to extract individual scene links.
                    let parentLink = card.closest('a[href*="/scenes/"]');
                    let href = parentLink ? parentLink.getAttribute('href') : '';
                    let isMovieFallback = false;
                    let isNameFallback = false;
                    if (!href) {
                        parentLink = card.closest('a[href*="/movies/"]');
                        href = parentLink ? parentLink.getAttribute('href') : '';
                        isMovieFallback = !!href;
                    }
                    if (!href) {
                        parentLink = card.closest('a[href*="/name/"]');
                        href = parentLink ? parentLink.getAttribute('href') : '';
                        isNameFallback = !!href;
                    }
                    if (!href) return;

                    const clean = String(href).replace(/\\\//g, '/').replace(/\\u002[fF]/g, '/');
                    const sid = isMovieFallback
                        ? clean.match(/\/movies\/\d+-([a-zA-Z0-9_-]+?)(?:[\/?#\s"'<>&]|$)/)
                        : isNameFallback
                        ? clean.match(/\/name\/([a-zA-Z0-9_-]+?)(?:[\/?#\s"'<>&]|$)/)
                        : clean.match(/(?:\/g)?\/scenes\/(\d{3,})(?:[\/?#\s"'<>._-]|$)/);
                    if (!sid || seen.has(sid[1])) return;
                    seen.add(sid[1]);
                    const gen11 = card.querySelector('.gen11');
                    const gen12 = card.querySelector('.gen12.bold') || card.querySelector('.gen12');
                    const titleEl = (gen12 && gen12.textContent.trim().length > 2)
                        ? gen12
                        : (parentLink ? parentLink.getAttribute('title') : '');

                    let _resultDate = '', _resultStudio = '';
                    if (gen11) {
                        const gen11Text = gen11.textContent || '';
                        const dateMatch = gen11Text.match(/([a-zA-Z]{3,})\s+(\d{1,2}),\s+(\d{4})/);
                        if (dateMatch) _resultDate = this._normalizeDateStr(dateMatch[0]);
                        const studioEl = gen11.querySelector('i');
                        if (studioEl) _resultStudio = this._normalizeStudioName(studioEl.textContent);
                    }

                    results.push({
                        url: new URL(clean, DATA18_ORIGIN).href,
                        sceneId: sid[1],  // movie slug when isMovieFallback
                        text: safeString(typeof titleEl === 'string' ? titleEl : titleEl.textContent),
                        _resultDate, _resultStudio,
                        _resultStudioId: '',
                        _isMovieResult: isMovieFallback,
                        _isNameResult: isNameFallback,
                    });
                });
            } catch (e) {
                this.debug("DOM parse error in parseSearchResults", e);
            }

            // Fallback: regex-based extraction for results not caught by DOM parsing
            const addFallback = (urlStr, text) => {
                const clean = String(urlStr || '').replace(/\\\//g, '/').replace(/\\u002[fF]/g, '/');
                const sid = clean.match(/(?:\/g)?\/scenes\/(\d{3,})(?:[\/?#\s"'<>._-]|$)/);
                if (!sid || seen.has(sid[1])) return;
                seen.add(sid[1]);
                results.push({
                    url: new URL(clean, DATA18_ORIGIN).href, sceneId: sid[1],
                    text: safeString(text || ''),
                    _resultDate: '', _resultStudio: '', _resultStudioId: ''
                });
            };

            // Attribute-based links
            const attrRe = /\b(?:data-url|data-href|onclick|location\.href)\s*=\s*["']([^"']*\/scenes\/[^"']*)["']/gi;
            let m;
            while ((m = attrRe.exec(source))) addFallback(m[1], '');

            // Escaped URLs
            const escapedRe = /https?:\\\/\\\/[^"'\s\\]*\\\/scenes\\\/\d+/gi;
            while ((m = escapedRe.exec(source))) {
                addFallback(m[0].replace(/\\\//g, '/').replace(/\\u002[fF]/g, '/'), '');
            }

            // Plain text /scenes/ paths
            const simpleRe = /(?:\/g)?\/scenes\/(\d{3,})/g;
            while ((m = simpleRe.exec(source))) {
                if (!seen.has(m[1])) {
                    seen.add(m[1]);
                    results.push({
                        url: `${DATA18_ORIGIN}/scenes/${m[1]}`, sceneId: m[1],
                        text: '', _resultDate: '', _resultStudio: '', _resultStudioId: ''
                    });
                }
            }

            return results;
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

        async collectMediaFromDetail(html, detailUrl, pageSceneId = "") {
            const direct = this.extractMedia(html, detailUrl);
            this.debug("direct media", direct);

            const mediaId = this.extractMediaId(html, detailUrl, pageSceneId);
            this.debug("internal media id", mediaId);

            const currentPhotoId = this.extractCurrentPhotoId(html, detailUrl);
            const photoIds = this.extractPhotoIds(html, detailUrl);
            this.debug("photo ids", photoIds);

            const ids = this.extractNetworkSiteIds(html);
            this.debug("network/site ids", ids);

            const bdnCandidates = [];
            if (ids.network_id && ids.site_id && mediaId) {
                const photoCount = Math.min(this.extractPhotoCount(html) || 8, IMAGE_PROBE_MAX);
                for (let i = 1; i <= photoCount; i++) {
                    bdnCandidates.push(
                        `https://bdn.dt18.com/${ids.network_id}/${ids.site_id}/${mediaId}/t${String(i).padStart(2, "0")}.jpg`
                    );
                }
            }

            // Canonical URLs contain this scene's network/site/media identifiers.
            // Once available, never merge generic gallery/search thumbnails into them.
            const bdnImages = bdnCandidates.length
                ? await this.filterExistingImages(bdnCandidates, detailUrl)
                : [];

            const interfaceImages = mediaId && !bdnImages.length
                ? await this.fetchPhotoInterfaceImages({ mediaId, photoIds, currentPhotoId, detailUrl, html })
                : [];

            const interfaceVideo = mediaId
                ? await this.fetchTrailerInterfaceVideo({ mediaId, currentPhotoId, detailUrl })
                : "";

            const lazyUrls = this.extractLazyUrls(html, detailUrl);
            const lazyMedia = await this.fetchLazyMedia(lazyUrls, detailUrl);

            // Include CDN thumbnails whose media ID matches this scene
            const matchedDirectImages = mediaId
                ? direct.images.filter(url => {
                    const m = url.match(/\/scenes\/\d+\/\d+\/(\d{5,})\.jpg/);
                    return m && m[1] === mediaId;
                  })
                : [];

            const allImages = bdnImages.length
                ? bdnImages
                : unique([...interfaceImages, ...matchedDirectImages]);

            const fallbackImages = allImages.length
                ? []
                : await this.filterExistingImages(this.buildImageCandidates([...direct.images, ...lazyMedia.images]), detailUrl);

            const videos = unique([interfaceVideo, ...direct.videos, ...lazyMedia.videos]);
            const images = this.sortImages(unique([...allImages, ...fallbackImages]));

            // Filter out placeholder / non-content images
            const junkPatterns = [
                /\/images\/pixel\.jpg$/i,
                /\/images\/thumb-end\.jpg$/i,
                /\/images\/thumb-to-init\.jpg$/i,
                /\/images\/close_search\.jpg$/i,
                /\/images\/icon-search/i,
                /\/images\/icon-onorder/i,
                /\/images\/spritesheet/i,
                /\/images\/asacp/i,
                /\/images\/rta/i,
                /\/images\/favicon/i,
                /\/images\/names\//i,
            ];
            const filteredImages = images.filter(url => !junkPatterns.some(pat => pat.test(url)));

            return { mediaId, videoUrl: videos[0] || "", images: filteredImages };
        },

        extractNetworkSiteIds(html) {
            const source = this.normalizeHtml(html);
            const ids = { network_id: "", site_id: "" };

            // network_id: 多个模式链式匹配
            let m = source.match(/changepornstarnav\d+_studio_\d+_(\d{2,6})/i)
                || source.match(/[?&]studio=(\d{2,6})(?:&|$|")/i)
                || source.match(/\bstudio[=:]\s*(\d{2,6})\b/i)
                || source.match(/\/sys\/nav_scenes\.php[^"']*?studio=(\d{2,6})/i);
            if (m) ids.network_id = m[1];

            // bdn URL 同时提供 network + site
            let bdnM = source.match(/https?:\/\/bdn\.dt18\.com\/(\d+)\/(\d+)\//i);
            if (bdnM) {
                ids.network_id = ids.network_id || bdnM[1];
                ids.site_id = ids.site_id || bdnM[2];
            }

            // site_id: 多个模式链式匹配
            m = source.match(/[?&]dosite=(\d{2,6})(?:&|$|")/i)
                || source.match(/\/g\/scenes\/\d+\/(\d{2,6})(?:[?#"]|$)/i)
                || source.match(/\bsite=(\d{2,6})\b/i);
            if (m) ids.site_id = ids.site_id || m[1];

            return ids;
        },

        extractPageSceneId(url) {
            const match = String(url || "").match(/\/scenes\/(\d+)(?:[/?#]|$)/i);
            return match ? match[1] : "";
        },

        extractMediaId(html, detailUrl, pageSceneId = "") {
            const source = this.normalizeHtml(html);
            const candidates = [];

            const patterns = [
                /\/sys\/(?:media_photos|media_thumbs|media_galleries)\.php\?[^"'<>\s]*\bscene=(\d{5,})/gi,
                /\/sys\/user\.php\?[^"'<>\s]*(?:\bid=|\bscene=|\bitem=)(\d{5,})/gi,
                /\/sys\/media_big\.php\?[^"'<>\s]*\bsc=(\d{5,})/gi,
                /\/sys\/media_tools\.php\?[^"'<>\s]*\bsc=(\d{5,})/gi,
                /\b(?:scene|id|item|sc)=(\d{5,})/gi,
                /\/media\/(?:t\/\d+\/)?scenes\/\d+\/\d+\/(\d{5,})\.(?:jpg|png|webp)/gi,
                /\/\d+\/\d+\/(\d{5,})\/t\d{2}\.jpg/gi
            ];

            for (const pattern of patterns) {
                let m;
                while ((m = pattern.exec(source))) {
                    candidates.push(m[1]);
                }
            }

            const pageId = String(pageSceneId || this.extractPageSceneId(detailUrl));
            const counts = new Map();
            candidates.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));

            const sorted = [...counts.entries()].sort((a, b) => {
                const aIsPage = a[0] === pageId;
                const bIsPage = b[0] === pageId;
                if (candidates.length > 1) {
                    if (aIsPage && !bIsPage) return 1;
                    if (!aIsPage && bIsPage) return -1;
                }
                return b[1] - a[1];
            });

            let chosen = sorted[0] ? sorted[0][0] : pageId;

            if (chosen === pageId && candidates.length > 1) {
                const nonPage = candidates.filter(id => id !== pageId);
                if (nonPage.length) {
                    nonPage.sort((a, b) => a.length - b.length || (counts.get(b) || 0) - (counts.get(a) || 0));
                    chosen = nonPage[0];
                }
            }

            return chosen;
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
                const m = source.match(pattern);
                if (m) return m[1];
            }
            return "";
        },

        extractPhotoIds(html, detailUrl) {
            const source = this.normalizeHtml(html);
            const ids = new Set();

            const patterns = [
                /#image(\d{1,5})/gi,
                /\bid=["'](?:next2_|next_|newest_|gallery)(\d{1,5})["']/gi,
                /\bid=["'](\d{1,5})["']/gi,
                /\bchange_image\(\s*(\d{1,5})\s*\)/gi,
                /\bpic=(\d{1,5})/gi
            ];

            for (const pattern of patterns) {
                let m;
                while ((m = pattern.exec(source))) {
                    ids.add(m[1]);
                }
            }

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
            const ids = unique([...(photoIds || []), currentPhotoId].filter(Boolean));
            const images = [];

            for (const pic of ids) {
                const url = this.buildPhotoInterfaceUrl(mediaId, pic);
                try {
                    const responseHtml = await this.fetchFromData18(url, {
                        referer: detailUrl, accept: "text/html, */*; q=0.01",
                        ajax: true, timeout: 15000
                    });
                    images.push(...this.extractMedia(responseHtml, url).images);
                } catch (err) {
                    console.warn("[PornData18Media] photo interface failed:", url, err);
                }
            }

            const expectedCount = this.extractPhotoCount(html);
            if (expectedCount && images.length < expectedCount) {
                images.push(...await this.fetchGalleryInterfaceImages(mediaId, detailUrl, ids));
            }

            return this.sortImages(unique(images));
        },

        async fetchGalleryInterfaceImages(mediaId, detailUrl, knownPhotoIds = []) {
            const urls = [
                `${DATA18_ORIGIN}/sys/media_galleries.php?s=1&scene=${encodeURIComponent(mediaId)}`,
                `${DATA18_ORIGIN}/sys/media_galleries.php?scene=${encodeURIComponent(mediaId)}&s=1&pic=${encodeURIComponent(knownPhotoIds[0] || "")}`
            ];

            const images = [];
            const extraIds = new Set();
            for (const url of urls) {
                try {
                    const html = await this.fetchFromData18(url, {
                        referer: detailUrl, accept: "text/html, */*; q=0.01",
                        ajax: true, timeout: 15000
                    });
                    images.push(...this.extractMedia(html, url).images);
                    this.extractPhotoIds(html, detailUrl).forEach(id => {
                        if (!knownPhotoIds.includes(id)) extraIds.add(id);
                    });
                } catch (err) {
                    console.warn("[PornData18Media] gallery interface failed:", url, err);
                }
            }

            for (const id of [...extraIds].sort((a, b) => Number(a) - Number(b)).slice(0, 80)) {
                try {
                    const html = await this.fetchFromData18(this.buildPhotoInterfaceUrl(mediaId, id), {
                        referer: detailUrl, accept: "text/html, */*; q=0.01",
                        ajax: true, timeout: 15000
                    });
                    images.push(...this.extractMedia(html, this.buildPhotoInterfaceUrl(mediaId, id)).images);
                } catch (err) {
                    console.warn("[PornData18Media] gallery photo failed:", id, err);
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

            const visited = new Set();
            for (const url of urls) {
                const video = await this.fetchVideoFromInterface(url, detailUrl, visited);
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
                    ajax: true, timeout: 16000
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
            for (const pattern of patterns) {
                let m;
                while ((m = pattern.exec(source))) {
                    const url = this.absoluteUrl(m[1], baseUrl);
                    if (this.isData18Url(url) && /player|trailer|video|media|user\.php|media_big|\.mp4/i.test(url)) {
                        urls.add(url);
                    }
                }
            }
            return [...urls];
        },

        getScreenWidth() {
            try {
                return Math.max(1024, Number(window.innerWidth || screen.width || 1280));
            } catch (err) {
                return 1280;
            }
        },

        extractMedia(html, baseUrl) {
            const source = this.normalizeHtml(html);
            const videos = [];
            const images = [];

            // DOM 解析
            try {
                const dom = new DOMParser().parseFromString(source, "text/html");
                dom.querySelectorAll("source[src], video[src]").forEach(node => {
                    const url = this.absoluteUrl(node.getAttribute("src"), baseUrl);
                    if (this.isMp4Url(url)) videos.push(url);
                });
                dom.querySelectorAll("img[src]").forEach(node => {
                    const url = this.absoluteUrl(node.getAttribute("src"), baseUrl);
                    if (this.isPreviewImageUrl(url)) images.push(url);
                });
            } catch (err) {
                console.warn("[PornData18Media] DOM media parse failed:", err);
            }

            // vs.dt18.com mp4
            const vsRe = /https?:\/\/vs\.dt18\.com[^\s"'<>\\]+?\.mp4(?:\?[^\s"'<>\\]*)?/gi;
            let m;
            while ((m = vsRe.exec(source))) {
                const url = this.cleanUrl(m[0]);
                if (this.isMp4Url(url)) videos.push(url);
            }

            // 通用 mp4 兜底
            const mp4Re = /https?:\/\/[^\s"'<>\\]+?\.mp4(?:\?[^\s"'<>\\]*)?/gi;
            while ((m = mp4Re.exec(source))) {
                const url = this.cleanUrl(m[0]);
                if (this.isMp4Url(url)) videos.push(url);
            }

            // bdn/cdn.dt18.com jpg (includes /t/{size}/scenes/.../id.jpg CDN path)
            const bdnRe = /https?:\/\/(?:bdn|cdn)\.dt18\.com[^\s"'<>\\]+?\.jpg(?:\?[^\s"'<>\\]*)?/gi;
            while ((m = bdnRe.exec(source))) {
                const url = this.cleanUrl(m[0]);
                if (this.isPreviewImageUrl(url)) images.push(url);
            }

            // 通用 /tNN.jpg 兜底
            const tRe = /https?:\/\/[^\s"'<>\\]+?\/t\d{2}\.jpg(?:\?[^\s"'<>\\]*)?/gi;
            while ((m = tRe.exec(source))) {
                const url = this.cleanUrl(m[0]);
                if (this.isPreviewImageUrl(url)) images.push(url);
            }

            return { videos: unique(videos), images: this.sortImages(unique(images)) };
        },

        buildImageCandidates(images) {
            const candidates = new Set();
            images.forEach(imageUrl => {
                candidates.add(imageUrl);
                const clean = this.stripQuery(imageUrl);
                // bdn.dt18.com /tNN.jpg pattern (e.g. /t01.jpg)
                const match = clean.match(/^(.*\/t)(\d{2})(\.jpg)$/i);
                if (match) {
                    for (let i = 1; i <= IMAGE_PROBE_MAX; i++) {
                        candidates.add(`${match[1]}${String(i).padStart(2, "0")}${match[3]}`);
                    }
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
                    consecutiveMisses++;
                    if (existing.length && consecutiveMisses >= IMAGE_PROBE_STOP_MISSES) break;
                }
            }

            return this.sortImages(unique(existing));
        },

        async imageExists(url, referer) {
            try {
                const head = await this.fetchFromData18(url, {
                    method: "HEAD", referer,
                    accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                    returnResponse: true, timeout: 10000
                });
                if (this.isOkStatus(head.status)) return true;
                if (head.status && ![403, 405, 0].includes(Number(head.status))) return false;
            } catch (err) {}

            try {
                const get = await this.fetchFromData18(url, {
                    method: "GET", referer,
                    accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                    returnResponse: true, timeout: 12000
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

            const collect = pattern => {
                let m;
                while ((m = pattern.exec(source))) {
                    const url = this.absoluteUrl(m[1], detailUrl);
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
                        referer, accept: "text/html,application/json,*/*;q=0.8",
                        ajax: true, timeout: 15000
                    });
                    const media = this.extractMedia(html, url);
                    videos.push(...media.videos);
                    images.push(...media.images);
                } catch (err) {
                    console.warn("[PornData18Media] lazy request failed:", url, err);
                }
            }

            return { videos: unique(videos), images: this.sortImages(unique(images)) };
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
            try {
                const parsed = new URL(url);
                const host = parsed.hostname.toLowerCase();
                if (!/(^|\.)data18\.com$|(^|\.)dt18\.com$/.test(host)) return false;
                if (/^\/scenes\//i.test(parsed.pathname)) return false;
                return /trailer|preview|photo|photos|image|images|gallery|video|media|scene/.test(`${parsed.pathname} ${parsed.search}`.toLowerCase());
            } catch (err) {
                return false;
            }
        },

        isPreviewImageUrl(url) {
            if (!/^https?:\/\/(?:bdn|cdn)\.dt18\.com\/[^\s"'<>]+\.jpg(?:\?.*)?$/i.test(url || ""))
                return false;
            // Exclude site-level auxiliary images that are never scene previews
            if (/\/(?:pixel|thumb-end|thumb-to-init|close_search|icon-search|icon-onorder|spritesheet|asacp|rta|favicon)[^\/]*\.(?:jpg|png|ico)$/i.test(url))
                return false;
            // Exclude non-scene image paths (names, covers, etc.)
            if (/\/(?:names|studios|sites|networks|movies|tags|covers)\//i.test(url))
                return false;
            // The media path /media/t/NN/scenes/.../id.jpg is a thumbnail;
            // only mark as preview when no bdn full-size variant is present.
            if (/\/media\/t\/\d+\/scenes\//i.test(url))
                return true;
            // bdn.dt18.com /tNN.jpg are the full-size variants
            if (/\/t\d{2}\.jpg$/i.test(url))
                return true;
            // Direct scene image paths from cdn — give the benefit of the doubt
            return /\/scenes\/\d+\/\d+\/\d{5,}\.jpg$/i.test(url);
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
                const val = code.charAt(0).toLowerCase() === "x"
                    ? parseInt(code.slice(1), 16)
                    : parseInt(code, 10);
                return Number.isFinite(val) ? String.fromCodePoint(val) : all;
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
                media.images.forEach(url => items.push({ type: "image", src: url }));
            }

            if (!items.length) {
                this.setStatus(panel, "Data18 未找到媒体");
                body.innerHTML = "";
                return;
            }

            const videoCount = media.videoUrl ? 1 : 0;
            const imageCount = Array.isArray(media.images) ? media.images.length : 0;
            this.setStatus(panel, `已找到 ${videoCount} 个预告片 / ${imageCount} 张预览图`);

            // 清除骨架屏
            body.innerHTML = "";
            body.innerHTML = `
                <div class="x-data18-media-strip" aria-label="Data18 预告片和预览图">
                    ${items.map(item => this.renderMediaCard(item)).join("")}
                </div>
            `;

            const strip = body.querySelector('.x-data18-media-strip');
            if (strip) {
                strip.addEventListener('wheel', (e) => {
                    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                        e.preventDefault();
                        strip.scrollBy({ left: e.deltaY, behavior: 'smooth' });
                    }
                }, { passive: false });
            }
            this.bindPreviewEvents(panel);
            this.proxyLoadMediaCards(panel);
        },

        renderMediaCard(item) {
            const src = this.escapeAttr(item.src);
            const playSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>';

            if (item.type === "video") {
                return `<button class="x-data18-media-card" type="button" data-type="video" data-src="${src}">
                    <div class="x-data18-thumb-placeholder x-data18-proxy-load" data-url="${src}" data-kind="video"></div>
                    <span class="x-data18-play-badge">${playSvg}</span>
                    <span class="x-data18-card-badge">预告片</span>
                </button>`;
            }

            return `<button class="x-data18-media-card" type="button" data-type="image" data-src="${src}">
                <div class="x-data18-thumb-placeholder x-data18-proxy-load" data-url="${src}" data-kind="image"></div>
            </button>`;
        },

        async proxyLoadMediaCards(panel) {
            const holders = [...panel.querySelectorAll('.x-data18-proxy-load')];
            await Promise.all(holders.map(holder => this._loadProxyCard(holder)));
        },

        async _loadProxyCard(holder) {
            const url = holder.dataset.url;
            const kind = holder.dataset.kind;
            try {
                const blob = await this._fetchBlobWithReferer(url);
                if (!blob) return;
                const objUrl = URL.createObjectURL(blob);
                if (kind === 'video') {
                    const video = document.createElement('video');
                    video.src = objUrl;
                    video.className = 'x-data18-thumb-video';
                    video.muted = true;
                    video.playsInline = true;
                    video.preload = 'metadata';
                    holder.parentElement.insertBefore(video, holder);
                    holder.remove();
                    const card = video.closest('.x-data18-media-card');
                    if (card) card.dataset.blobUrl = objUrl;
                } else {
                    const img = document.createElement('img');
                    img.className = 'x-data18-thumb-img';
                    img.src = objUrl;
                    img.loading = 'lazy';
                    holder.parentElement.insertBefore(img, holder);
                    holder.remove();
                    const card = img.closest('.x-data18-media-card');
                    if (card) card.dataset.blobUrl = objUrl;
                }
            } catch (err) {
                console.warn('[PornData18Media] proxy load failed:', url, err);
                holder.textContent = kind === 'video' ? '▶' : '×';
                holder.style.cssText = 'display:flex;align-items:center;justify-content:center;color:#999;font-size:24px;';
            }
        },

        _fetchBlobWithReferer(url) {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'GET', url,
                    headers: {
                        'Referer': `${DATA18_ORIGIN}/`,
                        'User-Agent': navigator.userAgent,
                        'Accept': '*/*'
                    },
                    timeout: 30000, responseType: 'arraybuffer',
                    anonymous: false, withCredentials: true,
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300 && res.response) {
                            const mime = /\.mp4$/i.test(url) ? 'video/mp4' : 'image/jpeg';
                            resolve(new Blob([res.response], { type: mime }));
                        } else {
                            resolve(null);
                        }
                    },
                    onerror: () => resolve(null),
                    ontimeout: () => resolve(null)
                });
            });
        },

        bindPreviewEvents(panel) {
            const allCards = [...panel.querySelectorAll(".x-data18-media-card")];
            const gallery = allCards.map(card => ({
                type: card.dataset.type, src: card.dataset.src, card,
            }));

            allCards.forEach((card, idx) => {
                card.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const blobUrl = card.dataset.blobUrl;
                    const src = card.dataset.src;
                    const type = card.dataset.type;
                    if (!type || (!blobUrl && !src)) return;
                    this.openLightbox({ type, src: blobUrl || src, rawSrc: src, gallery, index: idx }, panel.ownerDocument || document);
                });
            });
        },

        openLightbox(item, doc = document) {
            this.closeLightbox(doc);

            const box = doc.createElement("div");
            box.className = "x-data18-lightbox";
            box.setAttribute("role", "dialog");
            box.setAttribute("aria-modal", "true");
            box.innerHTML = `
                <button class="x-data18-lightbox-close" type="button" aria-label="关闭">&times;</button>
                <button class="x-data18-lightbox-prev" type="button" style="position:absolute;left:16px;top:50%;transform:translateY(-50%);z-index:2;border:0;background:rgba(255,255,255,0.15);color:#fff;font-size:32px;width:44px;height:44px;border-radius:999px;cursor:pointer;line-height:44px;text-align:center;">&#8249;</button>
                <button class="x-data18-lightbox-next" type="button" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);z-index:2;border:0;background:rgba(255,255,255,0.15);color:#fff;font-size:32px;width:44px;height:44px;border-radius:999px;cursor:pointer;line-height:44px;text-align:center;">&#8250;</button>
                <div class="x-data18-lightbox-inner"><div class="x-data18-lightbox-loading">加载中...</div></div>
            `;
            const inner = box.querySelector(".x-data18-lightbox-inner");

            let currentIdx = item.index || 0;
            const gallery = item.gallery || [{ type: item.type, src: item.src, rawSrc: item.rawSrc || item.src }];

            const loadItem = async (idx) => {
                currentIdx = idx;
                inner.innerHTML = '<div class="x-data18-lightbox-loading">加载中...</div>';
                const gi = gallery[idx];
                if (!gi) return;

                const blobUrl = gi.card ? gi.card.dataset.blobUrl : '';
                if (blobUrl) {
                    const safeSrc = this.escapeAttr(blobUrl);
                    inner.innerHTML = gi.type === "video"
                        ? `<video class="x-data18-lightbox-video" src="${safeSrc}" controls preload="metadata" playsinline autoplay></video>`
                        : `<img class="x-data18-lightbox-img" src="${safeSrc}">`;
                    return;
                }

                const blob = await this._fetchBlobWithReferer(gi.src);
                if (!blob) { inner.innerHTML = '<div style="color:white;text-align:center;padding:40px;">加载失败</div>'; return; }
                const newBlobUrl = URL.createObjectURL(blob);
                const safeSrc = this.escapeAttr(newBlobUrl);
                inner.innerHTML = gi.type === "video"
                    ? `<video class="x-data18-lightbox-video" src="${safeSrc}" controls preload="metadata" playsinline autoplay></video>`
                    : `<img class="x-data18-lightbox-img" src="${safeSrc}">`;
            };

            loadItem(currentIdx);

            box.querySelector('.x-data18-lightbox-prev').onclick = e => {
                e.stopPropagation();
                loadItem((currentIdx - 1 + gallery.length) % gallery.length);
            };
            box.querySelector('.x-data18-lightbox-next').onclick = e => {
                e.stopPropagation();
                loadItem((currentIdx + 1) % gallery.length);
            };

            box.addEventListener('wheel', (e) => {
                if (gallery.length <= 1) return;
                e.preventDefault();
                loadItem(e.deltaY > 0 || e.deltaX > 0
                    ? (currentIdx + 1) % gallery.length
                    : (currentIdx - 1 + gallery.length) % gallery.length);
            }, { passive: false });

            const onKeyDown = (event) => {
                if (event.key === "Escape") this.closeLightbox(doc);
                if (event.key === "ArrowLeft") loadItem((currentIdx - 1 + gallery.length) % gallery.length);
                if (event.key === "ArrowRight") loadItem((currentIdx + 1) % gallery.length);
            };
            box.__data18Keydown = onKeyDown;

            box.addEventListener("click", (event) => {
                if (event.target === box) this.closeLightbox(doc);
            });
            box.querySelector(".x-data18-lightbox-close").addEventListener("click", () => this.closeLightbox(doc));
            doc.addEventListener("keydown", onKeyDown);
            doc.body.appendChild(box);
        },

        closeLightbox(doc = document) {
            const old = doc.querySelector(".x-data18-lightbox");
            if (!old) return;

            if (old.__data18Keydown) doc.removeEventListener("keydown", old.__data18Keydown);
            old.querySelectorAll("video").forEach(video => {
                try {
                    video.pause();
                    video.removeAttribute("src");
                    video.load();
                } catch (err) {}
            });
            old.remove();
        },

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

            const keys = GM_listValues().filter(key => String(key).startsWith(CACHE_PREFIX));
            keys.forEach(key => GM_deleteValue(key));
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

/* =================================================================
 * 第二部分: 桥接层
 * ================================================================= */
(function() {
    'use strict';

    async function processPage() {
        if (!window.PornData18Media) return;
        try {
            await window.PornData18Media.ensurePanel(document);
        } catch(e) {}
    }

    function boot() {
        setTimeout(processPage, 2000);
    }

    if (document.readyState === 'complete') boot();
    else window.addEventListener('load', boot);

    let lastUrl = location.href;
    let lastTitle = '';
    new MutationObserver(() => {
        const currentUrl = location.href;
        const isUrlChange = currentUrl !== lastUrl;

        if (isUrlChange) {
            lastUrl = currentUrl;
            lastTitle = '';
            setTimeout(() => {
                document.querySelectorAll('.x-data18-wrap').forEach(el => el.remove());
                const waitForReady = setInterval(() => {
                    const h2 = document.querySelector('h2.text-3xl');
                    if (!h2) return;
                    const t = h2.textContent.trim();
                    if (t && t !== lastTitle) {
                        lastTitle = t;
                        clearInterval(waitForReady);
                        processPage();
                    }
                }, 200);
                setTimeout(() => clearInterval(waitForReady), 8000);
            }, 500);
        } else {
            const hasWrap = !!document.querySelector('.x-data18-wrap');
            const hasWest = !!document.querySelector('.x-west-wrap');

            // 延迟锚点：west 出现但 wrap 尚未创建
            if (!hasWrap && hasWest) {
                setTimeout(processPage, 1000);
                return;
            }

            // 标题变化（SPA 内同一 URL 不同场景）
            const h2 = document.querySelector('h2.text-3xl');
            if (!h2) return;
            const t = h2.textContent.trim();
            if (t && t !== lastTitle && !hasWrap) {
                lastTitle = t;
                setTimeout(processPage, 1000);
            }
        }
    }).observe(document.documentElement, { subtree: true, childList: true });

    unsafeWindow.__D18BRIDGE = {
        clearCache() { return window.PornData18Media ? window.PornData18Media.clearData18Cache() : 0; },
        process: processPage,
        reload() { document.querySelectorAll('.x-data18-wrap').forEach(el => el.remove()); return processPage(); },
    };
})();
