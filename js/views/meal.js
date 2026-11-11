// 🍚 급식 (kschoolinfo NEIS 프록시)
import { requestRender } from '../store.js';
import { icon } from '../icons.js';
import { esc, today, addDays, isDate, atNoon, WEEKDAYS, local } from '../utils.js';

const SCHOOL = { name: '마석고등학교', region: '경기도', kind: '고등학교' };
const API = 'https://kschoolinfo.com/api/v1';
const CODES_KEY = 'maseok_school_codes';
const ALLERGY = { 1: '난류', 2: '우유', 3: '메밀', 4: '땅콩', 5: '대두', 6: '밀', 7: '고등어', 8: '게', 9: '새우', 10: '돼지고기', 11: '복숭아', 12: '토마토', 13: '아황산류', 14: '호두', 15: '닭고기', 16: '쇠고기', 17: '오징어', 18: '조개류', 19: '잣' };

const M = { date: today(), status: 'idle', row: null, error: '' };
const cache = new Map();
let token = 0;

// 학교 코드는 바뀌지 않으므로 한 번 찾으면 기기에 저장해 두고 다시 묻지 않습니다.
async function schoolCodes() {
    const saved = local.get(CODES_KEY, null);
    if (saved?.eduCode && saved?.schoolCode) return saved;
    const q = new URLSearchParams(SCHOOL);
    const res = await fetch(`${API}/schools?${q}`);
    if (!res.ok) throw new Error('학교 정보를 가져오지 못했습니다.');
    const json = await res.json();
    const list = Array.isArray(json.data) ? json.data : Array.isArray(json.schools) ? json.schools : [];
    const s = list.find(x => (x.schoolName || x.name || x.SCHUL_NM) === SCHOOL.name) || list[0];
    if (!s) throw new Error('마석고등학교 정보를 찾지 못했습니다.');
    const codes = {
        eduCode: s.eduCode || s.officeCode || s.ATPT_OFCDC_SC_CODE,
        schoolCode: s.schoolCode || s.code || s.SD_SCHUL_CODE
    };
    if (!codes.eduCode || !codes.schoolCode) throw new Error('학교 코드 정보를 확인할 수 없습니다.');
    local.set(CODES_KEY, codes);
    return codes;
}

async function fetchMeal(date) {
    const key = date.replaceAll('-', '');
    if (cache.has(key)) return cache.get(key);
    const { eduCode, schoolCode } = await schoolCodes();
    const q = new URLSearchParams({ eduCode, schoolCode, date: key, type: 'lunch' });
    const res = await fetch(`${API}/meals?${q}`);
    if (!res.ok) {
        local.remove(CODES_KEY);   // 저장된 학교 코드가 잘못됐을 수도 있으니 다음엔 새로 찾기
        throw new Error('급식 정보를 가져오지 못했습니다.');
    }
    const json = await res.json();
    if (json.ok === false) throw new Error(json.error?.message || '급식 조회에 실패했습니다.');
    const rows = Array.isArray(json.data) ? json.data : [];
    const lunch = rows.find(x => String(x.type?.code || x.type || '') === '2' || String(x.type?.name || '').includes('중식')) || rows[0] || null;
    cache.set(key, lunch);
    return lunch;
}

export async function loadMeal(date = M.date, { silent = false } = {}) {
    if (!isDate(date)) return;
    M.date = date;
    const my = ++token;
    const key = date.replaceAll('-', '');
    if (cache.has(key)) {
        M.status = 'ok';
        M.row = cache.get(key);
        if (!silent) requestRender();
        return;
    }
    if (!silent) {
        M.status = 'loading';
        requestRender();
    }
    try {
        const row = await fetchMeal(date);
        if (my !== token) return;   // 그사이 다른 날짜를 골랐으면 무시
        M.status = 'ok';
        M.row = row;
    } catch (e) {
        if (my !== token) return;
        M.status = 'err';
        M.error = e.message || '잠시 후 다시 시도해 주세요.';
    }
    requestRender();
}

function menuHtml(row) {
    if (!row) return '<p class="meal-empty">선택한 날짜에는 등록된 급식이 없어요.</p>';
    const menu = Array.isArray(row.menu) ? row.menu : [];
    const used = new Set();
    const items = menu.map(item => {
        const name = typeof item === 'string' ? item : item.name || '';
        const raw = typeof item === 'object' ? item.allergens || item.allergy || [] : [];
        const codes = (Array.isArray(raw) ? raw : String(raw).split(/[,.\s]+/))
            .map(a => String(typeof a === 'object' ? a.code || a.id || '' : a).trim())
            .filter(Boolean);
        codes.forEach(c => used.add(c));
        return `<li>${esc(name)}${codes.length ? ` <span class="allergy">(${esc(codes.join('.'))})</span>` : ''}</li>`;
    }).join('');
    const legend = [...used].sort((a, b) => a - b).map(c => `${esc(c)} ${esc(ALLERGY[c] || '')}`.trim()).join(', ');
    return `<ul class="meal-list">${items || '<li>메뉴 정보가 없습니다.</li>'}</ul>
        <p class="m meal-kcal">칼로리: ${row.calories ? `${esc(row.calories)} Kcal` : '열량 정보 없음'}</p>
        ${legend ? `<p class="m">알레르기 번호: ${legend}</p>` : ''}`;
}

export function mealView() {
    let body;
    if (M.status === 'ok') body = menuHtml(M.row);
    else if (M.status === 'err') body = `<div class="meal-empty">급식 정보를 불러오지 못했어요.<br><span class="m">${esc(M.error)}</span><br><button type="button" class="ghost" data-action="mealRetry">다시 시도</button></div>`;
    else body = '<p class="meal-empty">급식 정보를 불러오는 중이에요...</p>';
    const d = atNoon(M.date);
    const title = M.date === today() ? '오늘의 마석고 급식' : `${d.getMonth() + 1}월 ${d.getDate()}일(${WEEKDAYS[d.getDay()]}) 급식`;
    return `<a class="back" href="#today">${icon('chev', 'flip')} 오늘로 돌아가기</a>
    <section class="card meal-card">
        <h3>${title}</h3>
        <div class="row meal-date">
            <button type="button" class="ghost" data-action="mealShift" data-d="-1" aria-label="이전 날짜">‹</button>
            <input id="meal-date" type="date" value="${esc(M.date)}" aria-label="날짜 선택" data-change="mealPick">
            <button type="button" class="ghost" data-action="mealShift" data-d="1" aria-label="다음 날짜">›</button>
            <button type="button" class="ghost" data-action="mealToday">오늘</button>
        </div>
        <div aria-live="polite">${body}</div>
    </section>`;
}

export const mealMounted = () => loadMeal(M.date);

/** 오늘 탭용: undefined = 아직 안 받음, null = 오늘 급식 없음, 객체 = {menu, kcal} */
export function lunchToday() {
    const k = today().replaceAll('-', '');
    if (!cache.has(k)) return undefined;
    const row = cache.get(k);
    if (!row) return null;
    const menu = (Array.isArray(row.menu) ? row.menu : []).map(i => (typeof i === 'string' ? i : i?.name || '')).filter(Boolean);
    return { menu, kcal: row.calories || '' };
}

/** 선택된 날짜(M.date)를 건드리지 않고 오늘 급식만 미리 받아 둡니다. */
export async function prefetchToday() {
    try {
        await fetchMeal(today());
    } catch { /* 오늘 탭은 '급식 보기'로 대신 안내합니다. */ }
    requestRender();
}

export const actions = {
    mealShift: el => loadMeal(addDays(M.date, Number(el.dataset.d))),
    mealToday: () => loadMeal(today()),
    mealPick: el => loadMeal(el.value),
    mealRetry: () => loadMeal(M.date)
};
