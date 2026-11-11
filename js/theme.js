// 화면 꾸미기: 6가지 색 팔레트로 배경(그라데이션/단색)과 글자색을 고르고, 글꼴 종류를 바꿉니다.
// 설정은 이 기기(localStorage)에 저장돼요. index.html 맨 위 스크립트가 같은 값을 먼저 읽어서 깜빡임이 없습니다.
import { local } from './utils.js';
import { requestRender } from './store.js';

export const PALETTE = [
    { id: 'ink', name: '바다 먹색', hex: '#0d2433' },
    { id: 'teal', name: '청록', hex: '#0e8c96' },
    { id: 'mint', name: '민트', hex: '#2ecf9a' },
    { id: 'chalk', name: '칠판 흰색', hex: '#f2f6f4' },
    { id: 'ember', name: '로고 주황', hex: '#e9450b' },
    { id: 'navy', name: '로고 남색', hex: '#1e2b5c' }
];
export const FONTS = [
    ['pretendard', '기본', 'var(--f-pre)'],
    ['gmarket', '둥근', 'var(--f-gm)'],
    ['system', '시스템', 'var(--f-sys)']
];
const UI_KEY = 'classSite_ui';
const LOOK_KEY = 'classSite_look';
const DEFAULT_BG = { light: ['#0b6e8a', '#14a37a'], dark: ['#06222e', '#0a4a3d'] };
const CHALK = '#f2f6f4';
const INK = '#0d2433';

export const ui = local.get(UI_KEY, {}) || {};
export const hexOf = id => PALETTE.find(p => p.id === id)?.hex || null;

// ----- 글자가 읽히는지 계산 (WCAG 명암비) -----
const lum = h => {
    const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
        .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (x, y) => {
    const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
    return (hi + 0.05) / (lo + 0.05);
};
const isDark = () => ui.t === 'dark' || (ui.t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);

/** 지금 설정으로 실제 보이게 될 배경색·글자색·글꼴 */
export function look() {
    const custom = ui.bg && hexOf(ui.bg.a) ? ui.bg : null;
    const [da, db] = DEFAULT_BG[isDark() ? 'dark' : 'light'];
    const a = custom ? hexOf(custom.a) : da;
    const b = custom ? (custom.m === 'solid' ? a : hexOf(custom.b) || a) : db;
    const worst = c => Math.min(ratio(c, a), ratio(c, b));
    const want = hexOf(ui.ink);
    const ok = !!want && worst(want) >= 3;
    const auto = worst(CHALK) >= worst(INK) ? CHALK : INK;
    return {
        custom: !!custom,
        a, b,
        ink: ok ? want : auto,
        inkWarn: !!want && !ok,   // 고른 글자색이 배경에 묻혀서 자동 색으로 바꿔 보여 주는 경우
        font: FONTS.some(f => f[0] === ui.font) ? ui.font : 'pretendard'
    };
}

export function applyUI() {
    const r = document.documentElement;
    const L = look();
    if (ui.t && ui.t !== 'system') r.dataset.theme = ui.t; else delete r.dataset.theme;
    r.dataset.fx = ui.fx === false ? 'off' : 'on';
    r.dataset.font = L.font;
    const set = (k, v) => (v ? r.style.setProperty(k, v) : r.style.removeProperty(k));
    set('--bg-a', L.custom ? L.a : '');
    set('--bg-b', L.custom ? L.b : '');
    set('--on-bg', L.ink);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', L.a);
    local.set(LOOK_KEY, { a: L.custom ? L.a : null, b: L.custom ? L.b : null, ink: L.ink, font: L.font });
}

function save() {
    local.set(UI_KEY, ui);
    applyUI();
    requestRender();
}

export const themeActions = {
    setTheme: el => { ui.t = el.dataset.t; save(); },
    setFx: el => { ui.fx = el.checked; save(); },
    setLook(el) {
        const { k, v } = el.dataset;
        if (k === 'ink') {
            if (v === 'auto') delete ui.ink;
            else if (hexOf(v)) ui.ink = v;
        } else if (k === 'font') {
            ui.font = v;
        } else if (k === 'm' || k === 'a' || k === 'b') {
            const bg = ui.bg || { m: 'grad', a: 'teal', b: 'mint' };
            if (k === 'm') bg.m = v === 'solid' ? 'solid' : 'grad';
            else if (hexOf(v)) bg[k] = v;
            ui.bg = bg;
        }
        save();
    },
    resetLook() {
        delete ui.bg;
        delete ui.ink;
        delete ui.font;
        save();
    }
};

matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyUI);
