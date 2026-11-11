// 🧹 청소 조 · 칠판 당번 · 청소 제외일
import { S, isStaff, nameOf, students, requestRender } from '../store.js';
import { $, $$, esc, today, isDate, atNoon, addDays, byKo, clearFields } from '../utils.js';
import { refs, setDoc } from '../firebase.js';

const ROLE_META = {
    general: { label: '총괄', min: 1, max: 1 },
    sweep: { label: '쓸기', min: 3, max: 4 },
    wipe: { label: '닦기', min: 3, max: 3 },
    board: { label: '칠판 정리', min: 1, max: 1 }
};
const BOARD_ORDER = ['김미루', '김채원', '김시연', '오한별', '윤은찬'];
const GROUPS = [1, 2, 3, 4];
const DAYS = [[1, '월'], [2, '화'], [3, '수'], [4, '목'], [5, '금']];
const countLabel = m => (m.min === m.max ? `${m.min}명` : `${m.min}~${m.max}명`);

export function emptyCleaning() {
    return {
        groups: Object.fromEntries(GROUPS.map(g => [g, { general: [], sweep: [], wipe: [], board: [] }])),
        schedule: { 1: '', 2: '', 3: '', 4: '', 5: '' },
        exceptions: [],
        boardDuty: { order: BOARD_ORDER.slice(), anchorDate: '2026-11-10', anchorIdx: 0, overrides: {} }
    };
}

/** Firestore에서 온 값을 항상 같은 모양으로 맞춥니다. (새 객체를 만들어서 복사본 역할도 합니다) */
export function normalizeCleaning(value) {
    const base = emptyCleaning();
    if (!value || typeof value !== 'object') return base;
    for (const g of GROUPS) {
        for (const role of Object.keys(ROLE_META)) {
            const list = value.groups?.[g]?.[role];
            base.groups[g][role] = Array.isArray(list) ? list.map(String) : [];
        }
    }
    for (const [day] of DAYS) {
        const group = Number(value.schedule?.[day]);
        base.schedule[day] = group >= 1 && group <= 4 ? String(group) : '';
    }
    base.exceptions = Array.isArray(value.exceptions)
        ? value.exceptions
            .map(x => (typeof x === 'string' ? { date: x, reason: '' } : x))
            .filter(x => x && isDate(x.date))
            .map(x => ({ date: x.date, reason: String(x.reason || '') }))
        : [];
    const bd = value.boardDuty || {};
    if (Array.isArray(bd.order) && bd.order.length) base.boardDuty.order = bd.order.map(String);
    if (isDate(bd.anchorDate)) base.boardDuty.anchorDate = bd.anchorDate;
    const ai = Number(bd.anchorIdx);
    base.boardDuty.anchorIdx = Number.isInteger(ai) && ai >= 0 && ai < base.boardDuty.order.length ? ai : 0;
    if (bd.overrides && typeof bd.overrides === 'object') {
        for (const [k, v] of Object.entries(bd.overrides)) {
            if (isDate(k) && v) base.boardDuty.overrides[k] = String(v);
        }
    }
    return base;
}

const isWeekday = ds => {
    const w = atNoon(ds).getDay();
    return w >= 1 && w <= 5;
};
const isCleanDay = ds => isWeekday(ds) && !S.cleaning.exceptions.some(x => x.date === ds);

export function boardDutyFor(ds) {
    const c = S.cleaning.boardDuty;
    const n = c.order.length;
    if (!n || !isCleanDay(ds)) return '';
    if (c.overrides[ds]) return c.overrides[ds];
    const skip = new Set(S.cleaning.exceptions.map(x => x.date));
    const forward = ds >= c.anchorDate;
    let from = forward ? c.anchorDate : ds;
    const to = forward ? ds : c.anchorDate;
    let count = 0;
    for (let i = 0; from < to && i < 800; i++, from = addDays(from, 1)) {
        if (isWeekday(from) && !skip.has(from)) count++;
    }
    const idx = c.anchorIdx + (forward ? count : -count);
    return c.order[((idx % n) + n) % n];
}

export function cleanTodayCard() {
    const date = today();
    const w = atNoon(date).getDay();
    const excluded = S.cleaning.exceptions.find(x => x.date === date);
    const group = w >= 1 && w <= 5 ? S.cleaning.schedule[w] : '';
    const names = ids => ids.map(nameOf).join(', ') || '미배정';
    let body;
    if (w === 0 || w === 6) {
        body = '<p class="m">주말에는 청소 일정이 없습니다.</p>';
    } else if (excluded) {
        body = `<p><b>오늘은 청소 제외일입니다.</b></p><p class="m">${esc(excluded.reason || '등록된 제외 사유가 없습니다.')}</p>`;
    } else if (!group) {
        body = '<p class="m">오늘 담당 조가 아직 지정되지 않았습니다.</p>';
    } else {
        const cfg = S.cleaning.groups[group] || {};
        body = `<p class="clean-group">오늘의 청소 담당 <b>${group}조</b></p>${Object.entries(ROLE_META).map(([k, m]) => `<div class="ev"><b>${m.label}</b><span>${esc(names(cfg[k] || []))}</span></div>`).join('')}`;
    }
    const board = boardDutyFor(date);
    const boardLine = board
        ? `<p class="m board-line">🧽 오늘 칠판 당번 <b>${esc(board)}</b>${S.me?.name === board ? ' <i class="badge">나</i>' : ''}</p>`
        : '';
    return `<section class="card"><h3>🧹 오늘의 청소</h3>${body}${boardLine}</section>`;
}

function boardView() {
    const c = S.cleaning.boardDuty;
    const td = today();
    const days = [];
    for (let i = 0, ds = td; days.length < 7 && i < 45; i++, ds = addDays(ds, 1)) {
        const who = boardDutyFor(ds);
        if (who) days.push([ds, who]);
    }
    const wk = ds => '일월화수목금토'[atNoon(ds).getDay()];
    const rows = days.map(([ds, who]) => `<div class="ev"><b>${ds.slice(5)} (${wk(ds)})</b><span>${esc(who)}${c.overrides[ds] ? ' <i class="badge">지정</i>' : ''}${ds === td ? ' <i class="badge">오늘</i>' : ''}</span></div>`).join('');
    const options = c.order.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    const admin = !isStaff() ? '' : `<h4>날짜별로 직접 지정</h4>
        <form class="row" data-submit="addBoardOverride">
            <input id="bd-date" type="date" value="${td}" aria-label="날짜" data-keep>
            <select id="bd-name" aria-label="당번" data-keep>${options}</select>
            <button>이 날 당번 지정</button>
        </form>
        ${Object.keys(c.overrides).sort().map(d => `<div class="ev"><b>${esc(d)}</b><span>${esc(c.overrides[d])}</span><span class="ev-tools"><button type="button" class="ghost" data-action="removeBoardOverride" data-date="${esc(d)}">해제</button></span></div>`).join('')}
        <details class="more"><summary class="m">순번 기준 바꾸기</summary>
            <form class="row" data-submit="saveBoardAnchor">
                <input id="bd-anchor-date" type="date" value="${esc(c.anchorDate)}" aria-label="기준 날짜" data-keep>
                <select id="bd-anchor-name" aria-label="기준 당번" data-keep>${c.order.map((n, i) => `<option value="${i}" ${i === c.anchorIdx ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
                <button>기준 저장</button>
            </form>
            <p class="m">위 날짜에 위 사람이 당번이 되고, 이후 평일(제외일 건너뜀)마다 순서대로 넘어가요.</p>
        </details>`;
    return `<section class="card"><h3>🧽 칠판 당번</h3><p class="m">${esc(c.order.join(' → '))} 순서로 평일마다 돌아가요.</p>${rows || '<p class="m">예정된 당번이 없어요.</p>'}${admin}</section>`;
}

function adminView() {
    const list = students().sort(byKo);
    const schedule = DAYS.map(([d, label]) => `<div class="between day-row"><label for="clean-day-${d}"><b>${label}요일</b></label><select id="clean-day-${d}" data-keep><option value="">미지정</option>${GROUPS.map(g => `<option value="${g}" ${S.cleaning.schedule[d] === String(g) ? 'selected' : ''}>${g}조</option>`).join('')}</select></div>`).join('');
    const groups = GROUPS.map(g => `<details class="group-box"><summary><b>${g}조 담당자</b></summary>
        ${Object.entries(ROLE_META).map(([role, meta]) => `<fieldset class="role-set"><legend><b>${meta.label}</b> <span class="m">(${countLabel(meta)})</span></legend>
            <div class="check-grid">${list.map(u => `<label class="todo"><input type="checkbox" data-keep data-key="cg-${g}-${role}-${esc(u.id)}" data-cg="${g}" data-cr="${role}" value="${esc(u.id)}" ${S.cleaning.groups[g][role].includes(String(u.id)) ? 'checked' : ''}><span>${esc(u.name)}</span></label>`).join('')}</div>
        </fieldset>`).join('')}
    </details>`).join('');
    const exceptions = S.cleaning.exceptions.slice().sort((a, b) => a.date.localeCompare(b.date));
    return `<section class="card"><h3>📆 요일별 담당 조 설정</h3>${schedule}<button type="button" class="mt" data-action="saveCleaningConfig">요일 설정 저장</button></section>
        <section class="card"><h3>👥 조별 청소 담당자 설정</h3>
            <p class="m">총괄 1명 · 쓸기 3~4명 · 닦기 3명 · 칠판 정리 1명으로 지정하세요. 한 조 안에서 같은 학생을 중복 배정할 수 없습니다.</p>
            ${groups}
            <button type="button" class="mt" data-action="saveCleaningConfig">조별 담당자 저장</button>
        </section>
        <section class="card"><h3>🚫 청소 제외일 관리</h3>
            <p class="m">공휴일이나 임시 휴업일은 자동 제외하지 않습니다. 날짜를 직접 등록해야 합니다.</p>
            <form class="row" data-submit="addCleaningException">
                <input id="clean-ex-date" type="date" aria-label="제외할 날짜" data-keep>
                <input id="clean-ex-reason" maxlength="60" placeholder="제외 사유 (선택)" aria-label="제외 사유" data-keep>
                <button>제외일 추가</button>
            </form>
            ${exceptions.map(x => `<div class="ev"><b>${esc(x.date)}</b><span>${esc(x.reason || '사유 없음')}</span><span class="ev-tools"><button type="button" class="ghost" data-action="removeCleaningException" data-date="${esc(x.date)}">해제</button></span></div>`).join('') || '<p class="m">등록된 제외일이 없습니다.</p>'}
        </section>`;
}

export const cleaningView = () => `${cleanTodayCard()}${boardView()}${isStaff() ? adminView() : ''}`;

// ----- 저장 -----
async function persist(next) {
    try {
        await setDoc(refs.cleaning, next);
        S.cleaning = next;
        requestRender();
        return true;
    } catch (e) {
        alert(e.message || '청소 설정을 저장하지 못했습니다.');
        return false;
    }
}
const denied = () => {
    if (isStaff()) return false;
    alert('선생님 또는 개발자만 수정할 수 있습니다.');
    return true;
};

async function saveCleaningConfig() {
    if (denied()) return;
    const next = normalizeCleaning(S.cleaning);
    for (const g of GROUPS) {
        const seen = new Set();
        for (const [role, meta] of Object.entries(ROLE_META)) {
            const ids = $$(`[data-cg="${g}"][data-cr="${role}"]:checked`).map(x => x.value);
            if (ids.length < meta.min || ids.length > meta.max)
                return alert(`${g}조 ${meta.label} 담당자는 ${countLabel(meta)}이어야 합니다.`);
            for (const id of ids) {
                if (seen.has(id)) return alert(`${g}조에서 같은 학생이 여러 역할에 중복 배정되어 있습니다.`);
                seen.add(id);
            }
            next.groups[g][role] = ids;
        }
    }
    for (const [d] of DAYS) {
        const sel = $(`#clean-day-${d}`);
        if (sel) next.schedule[d] = sel.value;
    }
    if (await persist(next)) {
        $$('[data-cg], [id^="clean-day-"]').forEach(el => delete el.dataset.dirty);
        alert('청소 담당자와 요일별 담당 조를 저장했습니다.');
    }
}

async function addBoardOverride() {
    if (denied()) return;
    const date = $('#bd-date')?.value;
    const name = $('#bd-name')?.value;
    if (!isDate(date) || !name) return alert('날짜와 당번을 선택해 주세요.');
    const next = normalizeCleaning(S.cleaning);
    next.boardDuty.overrides[date] = name;
    if (await persist(next)) $$('#bd-date, #bd-name').forEach(el => delete el.dataset.dirty);
}

async function removeBoardOverride(el) {
    if (denied()) return;
    const next = normalizeCleaning(S.cleaning);
    delete next.boardDuty.overrides[el.dataset.date];
    await persist(next);
}

async function saveBoardAnchor() {
    if (denied()) return;
    const date = $('#bd-anchor-date')?.value;
    const idx = Number($('#bd-anchor-name')?.value);
    if (!isDate(date) || !Number.isInteger(idx)) return alert('기준 날짜와 당번을 선택해 주세요.');
    const next = normalizeCleaning(S.cleaning);
    next.boardDuty.anchorDate = date;
    next.boardDuty.anchorIdx = idx;
    if (await persist(next)) {
        $$('#bd-anchor-date, #bd-anchor-name').forEach(el => delete el.dataset.dirty);
        alert('칠판 당번 순번 기준을 저장했습니다.');
    }
}

async function addCleaningException() {
    if (denied()) return;
    const date = $('#clean-ex-date')?.value;
    const reason = ($('#clean-ex-reason')?.value || '').trim();
    if (!isDate(date)) return alert('제외할 날짜를 선택해 주세요.');
    const next = normalizeCleaning(S.cleaning);
    const found = next.exceptions.find(x => x.date === date);
    if (found) found.reason = reason;
    else next.exceptions.push({ date, reason });
    if (await persist(next)) clearFields($('#clean-ex-date'), $('#clean-ex-reason'));
}

async function removeCleaningException(el) {
    if (denied()) return;
    const next = normalizeCleaning(S.cleaning);
    next.exceptions = next.exceptions.filter(x => x.date !== el.dataset.date);
    await persist(next);
}

export const actions = {
    saveCleaningConfig, addBoardOverride, removeBoardOverride,
    saveBoardAnchor, addCleaningException, removeCleaningException
};
