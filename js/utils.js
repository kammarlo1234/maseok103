// 여러 화면에서 같이 쓰는 작은 함수들

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** HTML 본문과 속성값에 넣을 문자열을 안전하게 바꿉니다. (onclick 같은 JS 코드 안에는 쓰지 마세요) */
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);

// ----- 날짜 (모두 'YYYY-MM-DD' 문자열로 다룹니다) -----
export const iso = d => d.toLocaleDateString('sv');
export const today = () => iso(new Date());
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
export const atNoon = ds => new Date(ds + 'T12:00:00');
export const addDays = (ds, n) => {
    const d = atNoon(ds);
    d.setDate(d.getDate() + n);
    return iso(d);
};
export const WEEKDAYS = '일월화수목금토';
export const dday = ds => Math.round((atNoon(ds) - atNoon(today())) / 864e5);
export const ddayLabel = n => (n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`);
export const fmtTime = t => {
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const byKo = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko');

// ----- 이미지 주소 검사 -----
// 우리 Cloudinary 주소가 아니면(예: javascript: 주소) 아예 쓰지 않습니다.
const CLD = 'https://res.cloudinary.com/';
export const safeImg = url => (typeof url === 'string' && url.startsWith(CLD) ? url : '');
export const cldT = (url, t) => {
    const u = safeImg(url);
    return u ? u.replace('/upload/', `/upload/${t}/`) : '';
};

// ----- localStorage (사파리 개인정보 보호 모드 등에서 실패해도 멈추지 않게) -----
export const local = {
    get(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch {
            return fallback;
        }
    },
    set(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 불가 환경 */ }
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch { /* 저장 불가 환경 */ }
    }
};

// ----- 사진을 1600px 이하 JPEG로 줄이기 -----
export async function compressImage(file, max = 1600) {
    try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.round(bmp.width * k);
        c.height = Math.round(bmp.height * k);
        const g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close?.();
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
        if (blob) return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch (e) {
        console.warn('이미지 압축 실패, 원본 사용', e);
    }
    return file;
}

// ----- 화면 갱신 -----
// patch()는 새 HTML이 이전과 같으면 아무것도 하지 않고,
// 다르면 바꾸되 사용자가 입력 중이던 칸(data-keep)과 포커스를 되살립니다.
const lastHtml = new WeakMap();
const keyOf = el => el.dataset.key || el.id || '';

function capture(root) {
    const saved = [];
    root.querySelectorAll('[data-keep][data-dirty]').forEach(el => {
        const k = keyOf(el);
        if (!k) return;
        saved.push([k, el.type === 'checkbox' || el.type === 'radio' ? { checked: el.checked } : { value: el.value }]);
    });
    let focus = null;
    const a = document.activeElement;
    if (a && a !== document.body && root.contains(a) && keyOf(a)) {
        let s = null, e = null;
        try { s = a.selectionStart; e = a.selectionEnd; } catch { /* 선택 범위가 없는 입력 */ }
        focus = { k: keyOf(a), s, e };
    }
    return { saved, focus };
}

function findByKey(root, k) {
    return root.querySelector(`[data-key="${CSS.escape(k)}"]`) || root.querySelector(`#${CSS.escape(k)}`);
}

function restore(root, { saved, focus }) {
    for (const [k, st] of saved) {
        const el = findByKey(root, k);
        if (!el) continue;
        if ('checked' in st) el.checked = st.checked;
        else el.value = st.value;
        el.dataset.dirty = '1';
    }
    if (focus) {
        const el = findByKey(root, focus.k);
        if (el) {
            el.focus({ preventScroll: true });
            try { if (focus.s != null) el.setSelectionRange(focus.s, focus.e); } catch { /* 체크박스 등 */ }
        }
    }
}

export function patch(el, html, { keep = true } = {}) {
    if (!el || lastHtml.get(el) === html) return false;
    const snap = keep ? capture(el) : null;
    el.innerHTML = html;
    lastHtml.set(el, html);
    if (snap) restore(el, snap);
    return true;
}

/** 제출이 끝난 입력칸을 비우고 '수정 중' 표시를 지웁니다. */
export function clearFields(...els) {
    for (const el of els) {
        if (!el) continue;
        if (el.type === 'checkbox' || el.type === 'radio') el.checked = el.defaultChecked;
        else el.value = '';
        delete el.dataset.dirty;
    }
}
