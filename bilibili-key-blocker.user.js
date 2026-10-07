// ==UserScript==
// @name         【哔哩哔哩】按键禁用
// @name:en      Bilibili Key Blocker
// @version      0.1.1
// @description  按需禁用 B 站播放页快捷键（Q/W/E/R/G、空格、方向键、Esc、F、Enter 等 20 项）；页面内可折叠设置面板，支持白天/黑夜/跟随系统主题
// @description:en  Block any Bilibili player shortcut you want (Q/W/E/R/G, Space, arrows, Esc, F, Enter … 20 keys) with a collapsible in-page settings panel and light/dark/system themes.
// @icon         https://static.hdslb.com/images/favicon.ico
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/list/*
// @match        https://www.bilibili.com/bangumi/play/*
// @match        https://www.bilibili.com/cheese/play/*
// @match        https://www.bilibili.com/medialist/play/*
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// @namespace    https://github.com/cgy141514/bilibili-key-blocker
// @homepageURL  https://github.com/cgy141514/bilibili-key-blocker
// @supportURL   https://github.com/cgy141514/bilibili-key-blocker/issues
// @downloadURL  https://raw.githubusercontent.com/cgy141514/bilibili-key-blocker/main/bilibili-key-blocker.user.js
// @updateURL    https://raw.githubusercontent.com/cgy141514/bilibili-key-blocker/main/bilibili-key-blocker.user.js
// @author       cgy141514
// @license      MIT
// @copyright    2026, cgy141514
// ==/UserScript==

/**
 * B 站按键禁用
 *
 * 设计要点
 * 1. 在 window 的捕获阶段监听 keydown / keyup，命中已禁用的按键时执行
 *    preventDefault + stopImmediatePropagation，保证页面自身（含播放器）
 *    完全收不到该按键，长按类快捷键的收尾同样被拦住。
 * 2. 脚本菜单只占 1 项，其余开关都放在页面内的浮层面板中。
 * 3. 面板用 Shadow DOM 隔离，样式既不受 B 站影响，也不污染 B 站。
 * 4. 开关、主题、折叠状态、面板位置均逐项持久化。
 *
 * 存储键
 *   block:<id>     每个按键的开关（true / false）
 *   ui:open        面板是否显示
 *   ui:collapsed   标题栏是否折叠
 *   ui:pos         面板位置 { left, top }
 *   ui:theme       auto | light | dark
 */
(function () {
    "use strict";

    /* ------------------------------------------------------------------ *
     * 日志
     * ------------------------------------------------------------------ */
    const PREFIX = "bilibili-key-blocker";
    const log = console.log.bind(console, PREFIX);

    /* ------------------------------------------------------------------ *
     * 存储：优先 GM_*，没有用户脚本管理器时降级 localStorage
     * ------------------------------------------------------------------ */
    const hasGM = typeof GM_getValue === "function" && typeof GM_setValue === "function";
    const store = {
        get(key, def) {
            try {
                if (hasGM) return GM_getValue(key, def);
                const raw = localStorage.getItem(key);
                return raw === null ? def : JSON.parse(raw);
            } catch (e) {
                console.warn(PREFIX, "读取配置失败", key, e);
                return def;
            }
        },
        set(key, value) {
            try {
                if (hasGM) GM_setValue(key, value);
                else localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                console.warn(PREFIX, "保存配置失败", key, e);
            }
        },
    };

    /* ------------------------------------------------------------------ *
     * 按键表
     *
     * 顺序与 B 站「快捷键说明」面板一致。
     * id           : 配置键名
     * label        : 面板中的键名
     * desc         : 该键在 B 站的作用
     * match        : 命中判定
     * blockInInput : 是否在输入框/弹幕框内也拦截（默认否，避免打不出字）
     * ------------------------------------------------------------------ */
    const noModifier = (e) => !e.ctrlKey && !e.altKey && !e.metaKey;

    // 方向键标签用内联 SVG 绘制，不依赖系统字体：
    // 直接写「→」等字符时，不同平台可能回退到 emoji 字体，字形宽度与基线都不一致。
    const ARROW = (d) =>
        '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
        '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.6" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const KEYS = [
        { id: "q", label: "Q", desc: "点赞/取消点赞（长按三连）" },
        { id: "w", label: "W", desc: "投币" },
        { id: "e", label: "E", desc: "收藏" },
        { id: "r", label: "R", desc: "长按一键三连" },
        { id: "g", label: "G", desc: "关注 UP 主" },
        {
            id: "space",
            label: "Space",
            desc: "播放/暂停",
            match: (e) => noModifier(e) && (e.key === " " || e.key === "Spacebar" || e.code === "Space"),
        },
        {
            id: "arrowRight",
            label: "→",
            icon: ARROW("M2.5 8h11M9.5 4.5 13 8l-3.5 3.5"),
            desc: "单次快进 5s，长按倍速播放",
            match: (e) => noModifier(e) && e.key === "ArrowRight",
        },
        {
            id: "arrowLeft",
            label: "←",
            icon: ARROW("M13.5 8h-11M6.5 4.5 3 8l3.5 3.5"),
            desc: "快退 5s",
            match: (e) => noModifier(e) && e.key === "ArrowLeft",
        },
        {
            id: "arrowUp",
            label: "↑",
            icon: ARROW("M8 13.5v-11M4.5 6.5 8 3l3.5 3.5"),
            desc: "音量增加 10%",
            match: (e) => noModifier(e) && e.key === "ArrowUp",
        },
        {
            id: "arrowDown",
            label: "↓",
            icon: ARROW("M8 2.5v11M4.5 9.5 8 13l3.5-3.5"),
            desc: "音量降低 10%",
            match: (e) => noModifier(e) && e.key === "ArrowDown",
        },
        {
            id: "escape",
            label: "Esc",
            desc: "退出全屏",
            match: (e) => noModifier(e) && (e.key === "Escape" || e.key === "Esc"),
        },
        {
            id: "mediaPlayPause",
            label: "媒体键",
            desc: "播放/暂停（键盘媒体键）",
            match: (e) => e.key === "MediaPlayPause",
        },
        { id: "f", label: "F", desc: "全屏/退出全屏" },
        { id: "[", label: "[", desc: "多 P 上一个" },
        { id: "]", label: "]", desc: "多 P 下一个" },
        {
            id: "enter",
            label: "Enter",
            desc: "发弹幕",
            // 禁用「发弹幕」时，弹幕输入框内也必须拦得住，Ctrl+Enter 同理
            blockInInput: true,
            match: (e) => !e.altKey && !e.metaKey && e.key === "Enter",
        },
        { id: "d", label: "D", desc: "开启/关闭弹幕" },
        { id: "m", label: "M", desc: "开启/关闭静音" },
        {
            id: "shift1",
            label: "Shift + 1",
            desc: "一倍速（正常倍速）",
            match: (e) => e.shiftKey && noModifier(e) &&
                (e.code === "Digit1" || e.code === "Numpad1" || e.key === "!"),
        },
        {
            id: "shift2",
            label: "Shift + 2",
            desc: "二倍速",
            match: (e) => e.shiftKey && noModifier(e) &&
                (e.code === "Digit2" || e.code === "Numpad2" || e.key === "@"),
        },
    ];

    // 未单独指定 match 的按键：按 e.key 匹配（不区分大小写），且排除 Ctrl/Alt/Meta 组合
    KEYS.forEach((def) => {
        if (def.match) return;
        const wanted = def.id.toLowerCase();
        def.match = (e) =>
            noModifier(e) && typeof e.key === "string" && e.key.toLowerCase() === wanted;
    });

    /* ------------------------------------------------------------------ *
     * 配置：默认全部关闭，逐项持久化
     * ------------------------------------------------------------------ */
    const CFG_PREFIX = "block:";
    const cache = {};

    function getConfig(def) {
        if (cache[def.id] === undefined) {
            cache[def.id] = store.get(CFG_PREFIX + def.id, false) === true;
        }
        return cache[def.id];
    }

    function setConfig(def, value) {
        cache[def.id] = value === true;
        store.set(CFG_PREFIX + def.id, cache[def.id]);
    }

    const disabledCount = () => KEYS.filter((def) => getConfig(def)).length;

    /* ================================================================== *
     * 设置面板
     * ================================================================== */
    const UI_KEY = { open: "ui:open", collapsed: "ui:collapsed", pos: "ui:pos", theme: "ui:theme" };
    const THEMES = ["auto", "light", "dark"];

    const PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.panel {
  --bg: rgba(30, 32, 38, .96);
  --fg: #e7e9ee;
  --muted: #9aa4b2;
  --line: rgba(255, 255, 255, .14);
  --soft: rgba(255, 255, 255, .06);
  --hover: rgba(255, 255, 255, .14);
  --head: rgba(255, 255, 255, .05);
  --accent: #00aeec;
  --shadow: 0 10px 28px rgba(0, 0, 0, .45);

  width: 360px;
  font: 12px/1.6 "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: var(--shadow);
  overflow: hidden;
}
.panel[data-theme="light"] {
  --bg: rgba(255, 255, 255, .98);
  --fg: #18191c;
  --muted: #61666d;
  --line: rgba(0, 0, 0, .12);
  --soft: rgba(0, 0, 0, .04);
  --hover: rgba(0, 0, 0, .08);
  --head: rgba(0, 0, 0, .04);
  --shadow: 0 10px 28px rgba(0, 0, 0, .18);
}
.hd { display: flex; align-items: center; gap: 6px; padding: 8px 10px; cursor: move; background: var(--head); }
.fold { width: 14px; text-align: center; cursor: pointer; color: var(--muted); font-size: 11px; }
.fold:hover { color: var(--fg); }
.title { flex: 1; font-weight: 600; white-space: nowrap; }
.sum { color: var(--accent); font-size: 11px; white-space: nowrap; }
.close { cursor: pointer; color: var(--muted); padding: 0 2px; }
.close:hover { color: #ff7a7a; }
.bd { max-height: 380px; overflow: auto; overscroll-behavior: contain; padding: 6px 8px; }
.row { display: grid; grid-template-columns: 16px 104px 1fr; gap: 2px 8px; align-items: start; padding: 4px 6px; border-radius: 6px; cursor: pointer; }
.row:hover { background: var(--hover); }
.row input { margin: 3px 0 0; accent-color: var(--accent); cursor: pointer; }
.row .key {
  display: flex;
  align-items: center;
  height: 19px;                 /* 固定一行高度，让键名与勾选框、描述首行同一条基线 */
  text-align: left;
  font-weight: 600;
  font-family: "Segoe UI Symbol", "Segoe UI", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
}
.row .key svg { display: block; }
.row .desc { color: var(--muted); }
.tip { color: var(--muted); padding: 8px 6px 2px; margin-top: 4px; font-size: 11px; border-top: 1px solid var(--line); }
.ft { display: flex; gap: 8px; padding: 8px 10px; border-top: 1px solid var(--line); }
.btn { flex: 1; padding: 5px 0; text-align: center; border-radius: 6px; cursor: pointer; background: var(--soft); }
.btn:hover { background: var(--hover); }
.btn.primary { background: var(--accent); color: #fff; }
.btn.primary:hover { background: #22bdf5; }
.seg { flex: 1; padding: 4px 0; text-align: center; border-radius: 6px; cursor: pointer; color: var(--muted); background: var(--soft); }
.seg:hover { background: var(--hover); }
.seg.active { background: var(--accent); color: #fff; }
.panel.collapsed .bd, .panel.collapsed .ft { display: none; }
`;

    const PANEL_HTML = `
<div class="panel">
  <div class="hd">
    <span class="fold" title="折叠 / 展开"></span>
    <span class="title">B 站按键禁用</span>
    <span class="sum"></span>
    <span class="close" title="关闭面板（可用脚本菜单重新打开）">✕</span>
  </div>
  <div class="bd"></div>
  <div class="ft">
    <div class="btn" data-act="all-on">全部禁用</div>
    <div class="btn primary" data-act="all-off">全部启用</div>
  </div>
  <div class="ft">
    <div class="seg" data-theme-mode="auto">跟随系统</div>
    <div class="seg" data-theme-mode="light">白天</div>
    <div class="seg" data-theme-mode="dark">黑夜</div>
  </div>
</div>
`;

    let host = null;
    let ui = null;
    const boxes = new Map(); // key id -> checkbox

    function ensureUI() {
        if (host) return;

        host = document.createElement("div");
        host.id = "bilibili-key-blocker";
        host.style.cssText =
            "position:fixed;top:96px;right:24px;display:block;margin:0;padding:0;border:0;" +
            "background:transparent;width:auto;height:auto;z-index:2147483647;";

        const shadow = host.attachShadow({ mode: "open" });
        shadow.innerHTML = "<style>" + PANEL_CSS + "</style>" + PANEL_HTML;

        ui = {
            panel: shadow.querySelector(".panel"),
            hd: shadow.querySelector(".hd"),
            fold: shadow.querySelector(".fold"),
            title: shadow.querySelector(".title"),
            sum: shadow.querySelector(".sum"),
            close: shadow.querySelector(".close"),
            bd: shadow.querySelector(".bd"),
            fts: Array.prototype.slice.call(shadow.querySelectorAll(".ft")),
        };

        // ---- 开关列表 ----
        KEYS.forEach((def) => {
            const row = document.createElement("label");
            row.className = "row";

            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = getConfig(def);

            const keyEl = document.createElement("span");
            keyEl.className = "key";
            if (def.icon) keyEl.innerHTML = def.icon; // 内联 SVG 常量，方向键专用
            else keyEl.textContent = def.label;

            const descEl = document.createElement("span");
            descEl.className = "desc";
            descEl.textContent = def.desc;

            row.append(box, keyEl, descEl);
            box.addEventListener("change", () => {
                setConfig(def, box.checked);
                refreshUI();
            });

            boxes.set(def.id, box);
            ui.bd.appendChild(row);
        });

        const tip = document.createElement("div");
        tip.className = "tip";
        tip.textContent =
            "在输入框、弹幕框、评论区里打字不会被拦截（Enter 例外：勾选后弹幕框内也无法发送）。";
        ui.bd.appendChild(tip);

        // ---- 阻止滚动穿透 ----
        // 指针在面板上滚动时，事件一律不再传给 B 站页面；
        // 列表滚到顶 / 底之后继续滚动，也不会继续带动页面滚动。
        // CSS 的 overscroll-behavior: contain 是第一道防线，这里再兜一层，
        // 顺便覆盖标题栏、按钮区等「不可滚动」的区域。
        shadow.addEventListener("wheel", (e) => {
            const path = typeof e.composedPath === "function" ? e.composedPath() : [];
            const inList = path.indexOf(ui.bd) !== -1;
            let atEdge = false;
            if (inList) {
                const top = ui.bd.scrollTop;
                const atBottom = top + ui.bd.clientHeight >= ui.bd.scrollHeight - 1;
                atEdge = (e.deltaY < 0 && top <= 0) || (e.deltaY > 0 && atBottom);
            }
            if (!inList || atEdge) e.preventDefault(); // 拦掉浏览器的默认滚动（含滚动链）
            e.stopPropagation();                       // 不让页面上的监听器收到
        }, { passive: false });

        // ---- 标题栏 ----
        ui.fold.addEventListener("click", (e) => {
            e.stopPropagation();
            setCollapsed(!isCollapsed());
        });
        ui.title.addEventListener("click", () => {
            if (dragMoved) { // 刚拖动过就不触发折叠
                dragMoved = false;
                return;
            }
            setCollapsed(!isCollapsed());
        });
        ui.close.addEventListener("click", (e) => {
            e.stopPropagation();
            setOpen(false);
        });

        // ---- 底部：全部禁用 / 全部启用 / 主题 ----
        ui.fts.forEach((ft) => {
            ft.addEventListener("click", (e) => {
                const t = e.target;
                if (!t || !t.dataset) return;
                if (t.dataset.act) {
                    KEYS.forEach((def) => setConfig(def, t.dataset.act === "all-on"));
                    refreshUI();
                    registerMenu();
                    return;
                }
                if (t.dataset.themeMode) {
                    store.set(UI_KEY.theme, t.dataset.themeMode);
                    applyTheme();
                }
            });
        });

        // ---- 拖动标题栏移动面板 ----
        let drag = null;
        let dragMoved = false;
        ui.hd.addEventListener("pointerdown", (e) => {
            if (e.target === ui.fold || e.target === ui.close) return;
            if (e.button !== 0) return;
            const rect = host.getBoundingClientRect();
            drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, x: e.clientX, y: e.clientY };
            dragMoved = false;
            ui.hd.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        ui.hd.addEventListener("pointermove", (e) => {
            if (!drag) return;
            if (Math.abs(e.clientX - drag.x) > 3 || Math.abs(e.clientY - drag.y) > 3) dragMoved = true;
            const minLeft = 60 - 360; // 允许拖到屏幕左侧，只留一点可抓取
            const maxLeft = window.innerWidth - 60;
            const maxTop = window.innerHeight - 30;
            const left = Math.min(Math.max(e.clientX - drag.dx, minLeft), maxLeft);
            const top = Math.min(Math.max(e.clientY - drag.dy, 0), maxTop);
            host.style.left = left + "px";
            host.style.top = top + "px";
            host.style.right = "auto";
        });
        ui.hd.addEventListener("pointerup", () => {
            if (!drag) return;
            drag = null;
            const rect = host.getBoundingClientRect();
            store.set(UI_KEY.pos, { left: Math.round(rect.left), top: Math.round(rect.top) });
        });

        // ---- 恢复上次的位置、折叠状态、主题 ----
        const pos = store.get(UI_KEY.pos, null);
        if (pos && typeof pos.left === "number" && typeof pos.top === "number") {
            host.style.left = pos.left + "px";
            host.style.top = pos.top + "px";
            host.style.right = "auto";
        }

        mountHost();
        setCollapsed(store.get(UI_KEY.collapsed, false) === true);
        applyTheme();
        refreshUI();
    }

    function mountHost() {
        if (!host || !host.isConnected) {
            (document.body || document.documentElement).appendChild(host);
            return;
        }
        // 尽量挂在 body 下，避免被页面脚本清理 dom 时带走
        if (document.body && host.parentNode !== document.body) {
            document.body.appendChild(host);
        }
    }

    function refreshUI() {
        if (!ui) return;
        KEYS.forEach((def) => {
            const box = boxes.get(def.id);
            if (box) box.checked = getConfig(def);
        });
        const n = disabledCount();
        ui.sum.textContent = n ? `已禁用 ${n}/${KEYS.length}` : "未禁用";
        ui.fold.textContent = isCollapsed() ? "▸" : "▾";
    }

    /* ---------------- 主题：跟随系统 / 白天 / 黑夜 ---------------- */
    function prefersDark() {
        return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }

    function themeMode() {
        const mode = store.get(UI_KEY.theme, "auto");
        return THEMES.indexOf(mode) >= 0 ? mode : "auto";
    }

    function applyTheme() {
        if (!ui) return;
        const mode = themeMode();
        const dark = mode === "dark" || (mode === "auto" && prefersDark());
        ui.panel.dataset.theme = dark ? "dark" : "light";
        Array.prototype.forEach.call(ui.panel.querySelectorAll(".seg"), (seg) => {
            seg.classList.toggle("active", seg.dataset.themeMode === mode);
        });
    }

    // 跟随系统时，系统深浅色变化要实时生效
    if (window.matchMedia) {
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => applyTheme();
        if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
        else if (typeof mq.addListener === "function") mq.addListener(onChange);
    }

    /* ---------------- 折叠 / 显示 ---------------- */
    function isCollapsed() {
        return store.get(UI_KEY.collapsed, false) === true;
    }

    function setCollapsed(collapsed) {
        store.set(UI_KEY.collapsed, collapsed === true);
        if (ui) ui.panel.classList.toggle("collapsed", collapsed === true);
        refreshUI();
    }

    function setOpen(open) {
        store.set(UI_KEY.open, open === true);
        if (!open && host && host.isConnected) {
            host.remove();
        } else if (open) {
            ensureUI();
            mountHost();
        }
        registerMenu();
    }

    function isPanelOpen() {
        return !!(host && host.isConnected);
    }

    /* ------------------------------------------------------------------ *
     * 脚本菜单：只注册 1 项
     * ------------------------------------------------------------------ */
    let menuId = null;

    function registerMenu() {
        if (typeof GM_registerMenuCommand !== "function") return;
        if (menuId !== null) {
            try {
                GM_unregisterMenuCommand(menuId);
            } catch (e) { /* 忽略 */ }
            menuId = null;
        }
        menuId = GM_registerMenuCommand(
            `⚙️ 按键禁用设置面板（已禁用 ${disabledCount()}/${KEYS.length}）`,
            () => setOpen(!isPanelOpen())
        );
    }

    registerMenu();

    /* ------------------------------------------------------------------ *
     * 拦截
     * ------------------------------------------------------------------ */

    // 焦点在输入框 / 文本域 / 可编辑区域时视为「正在打字」
    function isEditableEvent(e) {
        const path = typeof e.composedPath === "function" ? e.composedPath() : null;
        const node = (path && path[0]) || e.target;
        const el = node instanceof Element ? node : (node && node.parentElement) || null;
        if (!el) return false;
        if (el.isContentEditable) return true;
        const tag = el.tagName;
        return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    }

    function onKeyDown(e) {
        if (e.isComposing || e.keyCode === 229) return; // 输入法组合中，跳过

        const def = KEYS.find((item) => {
            try {
                return item.match(e);
            } catch (err) {
                return false;
            }
        });
        if (!def || !getConfig(def)) return;
        if (!def.blockInInput && isEditableEvent(e)) return;

        log("阻止按键", def.label, e.type);
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
    }

    // 挂在 window 捕获阶段，早于页面自身的任何监听
    ["keydown", "keyup"].forEach((type) => {
        window.addEventListener(type, onKeyDown, true);
    });

    // 面板按需创建：上次关掉了就不主动显示
    if (store.get(UI_KEY.open, true) === true) {
        if (document.body) {
            ensureUI();
        } else {
            document.addEventListener("DOMContentLoaded", ensureUI, { once: true });
        }
    }

    log("已就绪，脚本菜单中的「按键禁用设置面板」可打开 / 收起面板");
})();
