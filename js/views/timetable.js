// 🕘 공동 시간표 (선생님·개발자가 편집, 모두에게 실시간 공유)
import { S, requestRender } from '../store.js';
import { $, $$, esc, today, atNoon } from '../utils.js';
import { refs, setDoc } from '../firebase.js';

const DAYS = ['월', '화', '수', '목', '금'];
const TIMES = ['08:40~09:30', '09:40~10:30', '10:40~11:30', '11:40~12:30', '13:30~14:20', '14:30~15:20', '15:30~16:20'];
const blankWeek = () => ({
    start: '',
    times: TIMES.slice(),
    days: DAYS.map(() => TIMES.map(() => ({ s: '', t: '' })))
});

let week = 1;
let saving = false;
let editing = false;   // '편집'을 눌렀을 때만 편집 칸을 보여 줍니다.
let status = '';

const canEdit = () => ['teacher', 'dev'].includes(S.me?.role);

export function ttNormalize(raw) {
    const out = {};
    for (const w of [1, 2]) {
        const x = raw?.[w];
        if (!x) { out[w] = blankWeek(); continue; }
        const count = Math.max(1, Math.min(10, Array.isArray(x.times) ? x.times.length : 7));
        out[w] = {
            start: String(x.start || ''),
            times: Array.from({ length: count }, (_, i) => String(x.times?.[i] || '')),
            days: DAYS.map((_, d) => {
                // Firestore는 배열 안의 배열을 못 담아서 요일을 d0~d4 키로 저장합니다.
                const day = Array.isArray(x.days) ? x.days[d] : x.days?.['d' + d];
                return Array.from({ length: count }, (_, p) => {
                    const c = day?.[p] || {};
                    return { s: String(c.s || ''), t: String(c.t || '') };
                });
            })
        };
    }
    return out;
}

const forSave = data => Object.fromEntries([1, 2].map(k => {
    const w = data[k];
    return [k, { start: w.start, times: w.times, days: Object.fromEntries(w.days.map((day, d) => ['d' + d, day])) }];
}));

const key = (kind, ...rest) => `tt-${week}-${kind}-${rest.join('-')}`;

/** 편집기 칸에 적힌 내용을 (저장 전이라도) 상태로 옮겨 둡니다. 교시 추가·주 전환 때 입력이 사라지지 않아요. */
function collect() {
    const root = $('#tt-editor');
    if (!root) return;
    const val = (k, fb) => {
        const el = root.querySelector(`[data-key="${k}"]`);
        return el ? el.value.trim() : fb;
    };
    const w = S.timetable[week];
    w.start = val(key('start', 0), w.start);
    w.times = w.times.map((t, p) => val(key('time', p), t));
    w.days = w.days.map((day, d) => day.map((c, p) => ({ s: val(key('s', d, p), c.s), t: val(key('t', d, p), c.t) })));
}

function table(w, editable) {
    const td = today();
    const wd = atNoon(td).getDay();
    const todayCol = !editable && week === 1 && wd >= 1 && wd <= 5 ? wd - 1 : -1;
    const head = DAYS.map((d, i) => `<th scope="col"${i === todayCol ? ' class="is-today"' : ''}>${d}</th>`).join('');
    const rows = w.times.map((time, p) => {
        const th = editable
            ? `<th scope="row">${p + 1}<input class="tt-time" data-keep data-key="${key('time', p)}" value="${esc(time)}" placeholder="시간" aria-label="${p + 1}교시 시간"></th>`
            : `<th scope="row">${p + 1}${time ? `<small>${esc(time)}</small>` : ''}</th>`;
        const cells = w.days.map((day, d) => {
            const c = day[p] || { s: '', t: '' };
            const cls = d === todayCol ? ' class="is-today"' : '';
            if (editable) {
                return `<td><input class="tt-sub" data-keep data-key="${key('s', d, p)}" value="${esc(c.s)}" placeholder="과목" aria-label="${DAYS[d]}요일 ${p + 1}교시 과목"><input class="tt-tea" data-keep data-key="${key('t', d, p)}" value="${esc(c.t)}" placeholder="선생님" aria-label="${DAYS[d]}요일 ${p + 1}교시 선생님"></td>`;
            }
            return `<td${cls}>${c.s ? `<b>${esc(c.s)}</b>` : '<span class="m">-</span>'}${c.t ? `<i>${esc(c.t)}</i>` : ''}</td>`;
        }).join('');
        return `<tr>${th}${cells}</tr>`;
    }).join('');
    return `<div class="tt-wrap"><table class="tt${editable ? ' is-editing' : ''}"><thead><tr><th scope="col">교시</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function ttView() {
    const w = S.timetable[week];
    const editable = canEdit() && editing;
    const weekBar = `<div class="row tt-bar">${[[1, '이번 주'], [2, '다음 주']].map(([n, label]) => `<button type="button" class="${week === n ? '' : 'ghost'}" data-action="ttWeek" data-w="${n}" aria-pressed="${week === n}">${label}</button>`).join('')}${canEdit() ? `<button type="button" class="ghost push" data-action="ttEdit">${editing ? '편집 끝내기' : '시간표 편집'}</button>` : ''}</div>`;
    let body;
    if (editable) {
        body = `<div id="tt-editor">
            <div class="row"><label class="inline-label">시간표 시작일 <input type="date" data-keep data-key="${key('start', 0)}" value="${esc(w.start)}"></label><span class="m">선생님 또는 개발자 계정으로 편집할 수 있어요.</span></div>
            ${table(w, true)}
            <div class="row">
                <button type="button" class="ghost" data-action="ttAddPeriod">＋ 교시 추가</button>
                <button type="button" class="ghost" data-action="ttRemovePeriod">－ 마지막 교시 삭제</button>
                <button type="button" data-action="ttSave" ${saving ? 'disabled' : ''}>${saving ? '저장 중…' : '시간표 저장'}</button>
                <span class="m" aria-live="polite">${esc(status)}</span>
            </div>
        </div>`;
    } else {
        const hasData = w.days.some(day => day.some(c => c.s || c.t));
        body = hasData ? table(w, false) : '<p class="m">아직 등록된 시간표가 없어요. 선생님께 시간표 작성을 요청해 주세요.</p>';
    }
    return `<section class="card tt-card"><h3>우리 반 시간표</h3>${weekBar}${body}${editable ? '<p class="m">저장하면 같은 사이트의 모든 사용자에게 바로 공유됩니다.</p>' : ''}</section>`;
}

function ttWeek(el) {
    collect();
    week = Number(el.dataset.w) === 2 ? 2 : 1;
    status = '';
    requestRender();
}

function ttAddPeriod() {
    if (!canEdit()) return;
    collect();
    const w = S.timetable[week];
    if (w.times.length >= 10) return alert('교시는 최대 10교시까지 추가할 수 있어요.');
    w.times.push('');
    w.days.forEach(day => day.push({ s: '', t: '' }));
    requestRender();
}

function ttRemovePeriod() {
    if (!canEdit()) return;
    const w = S.timetable[week];
    if (w.times.length <= 1) return alert('최소 1교시는 남겨야 해요.');
    if (!confirm('마지막 교시를 삭제할까요? 해당 교시의 과목과 선생님 정보도 삭제됩니다.')) return;
    collect();
    w.times.pop();
    w.days.forEach(day => day.pop());
    requestRender();
}

async function ttSave() {
    if (!canEdit() || saving) return;
    collect();
    saving = true;
    status = '저장 중...';
    requestRender();
    try {
        await setDoc(refs.timetable, { weeks: forSave(S.timetable), updatedAt: Date.now(), updatedBy: S.me.name || '' }, { merge: true });
        status = '저장 완료 · 모든 사용자에게 반영됐어요.';
        $$('#tt-editor [data-dirty]').forEach(el => delete el.dataset.dirty);
    } catch (e) {
        status = '저장 실패: ' + (e.message || 'Firestore 권한을 확인해 주세요.');
    } finally {
        saving = false;
        requestRender();
    }
}

function ttEdit() {
    if (!canEdit()) return;
    if (editing) collect();
    editing = !editing;
    status = '';
    requestRender();
}

export const actions = { ttEdit, ttWeek, ttAddPeriod, ttRemovePeriod, ttSave };
