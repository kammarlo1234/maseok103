// 오늘 탭: 공지 바, 지금 수업(히어로), 하루 타임라인(시간표·점심·청소), 일정·디데이·1인1역·할 일
import { S, requestRender } from '../store.js';
import { $, esc, dday, ddayLabel, atNoon, WEEKDAYS, local, patch, clearFields } from '../utils.js';
import { refs, setDoc } from '../firebase.js';
import { openDialog, isOpen } from '../dialog.js';
import { noticeBar } from './notices.js';
import { cleanSummary } from './cleaning.js';
import { lunchToday } from './meal.js';
import { upcoming, evRow } from './calendar.js';
import { icon } from '../icons.js';

// 타임라인 아래쪽 카드들 (순서는 사용자가 바꿀 수 있어요)
const CARDS = {
    dday: '기말고사 디데이',
    events: '다가오는 일정',
    todo: '내 할 일',
    duty: '내 1인1역'
};
const DEFAULT_ORDER = Object.keys(CARDS);
const EXAM = { name: '기말고사', date: '2026-12-10' };

const orderKey = () => 'todayOrder:' + (S.me?.uid || '');
const ddayKey = () => 'ddayOn:' + (S.me?.uid || '');
const ddayOn = () => local.get(ddayKey(), 0) == 1;

function getOrder() {
    const saved = local.get(orderKey(), []);
    const valid = Array.isArray(saved) ? saved.filter((k, i) => Object.hasOwn(CARDS, k) && saved.indexOf(k) === i) : [];
    return [...valid, ...DEFAULT_ORDER.filter(k => !valid.includes(k))];
}

// ----- 오늘 하루 계획 (이번 주 시간표의 오늘 요일) -----
const pad = n => String(n).padStart(2, '0');
const fmtMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const RANGE = /(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/;
const parseRange = s => {
    const m = RANGE.exec(s || '');
    return m ? [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]] : null;
};
const nowMinutes = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
};

function plan() {
    const wd = new Date().getDay();
    if (wd === 0 || wd === 6) return { weekend: true };
    const w = S.timetable?.[1];
    const day = w?.days?.[wd - 1] || [];
    const rows = (w?.times || []).map((time, i) => ({ n: i + 1, s: day[i]?.s || '', t: day[i]?.t || '', time, range: parseRange(time) }));
    while (rows.length && !rows[rows.length - 1].s) rows.pop();   // 끝에 비어 있는 교시는 숨김
    if (!rows.length) return { empty: true };
    // 점심은 교시 사이에서 가장 긴 공백(40분 이상). 시간이 없으면 4교시 뒤로 봅니다.
    let lunch = null;
    for (let i = 0; i < rows.length - 1; i++) {
        const a = rows[i].range, b = rows[i + 1].range;
        if (a && b && b[0] - a[1] >= 40 && (!lunch || b[0] - a[1] > lunch.to - lunch.from)) lunch = { after: i, from: a[1], to: b[0] };
    }
    if (!lunch && rows.length > 4) lunch = { after: 3, from: null, to: null };
    return { rows, lunch };
}

function heroState(p, now) {
    if (p.weekend) return { label: '주말', title: '푹 쉬는 날이에요', cap: '월요일에 만나요' };
    if (p.empty) return { label: '시간표', title: '오늘 시간표가 아직 없어요' };
    const { rows, lunch } = p;
    if (!rows.some(r => r.range)) return { label: '오늘', title: `${rows.length}교시 수업` };
    const cur = rows.find(r => r.range && r.range[0] <= now && now < r.range[1]);
    if (cur) {
        const len = cur.range[1] - cur.range[0];
        return { label: `${cur.n}교시`, title: cur.s || '수업 중', min: cur.range[1] - now, cap: '남음', pct: (now - cur.range[0]) / len };
    }
    const next = rows.find(r => r.range && r.range[0] > now);
    if (!next) return { label: '수업 끝', title: '종례 후 청소' };
    const first = rows.find(r => r.range);
    const label = now < first.range[0] ? '등교 전'
        : lunch && lunch.from != null && now >= lunch.from && now < lunch.to ? '점심시간' : '쉬는 시간';
    return { label, title: `${next.n}교시 ${next.s || ''}`.trim(), min: next.range[0] - now, cap: '뒤 시작' };
}

function heroHtml(h) {
    const d = new Date();
    const pct = h.pct != null ? Math.round(Math.min(1, Math.max(0, h.pct)) * 100) : null;
    return `<section class="hero" aria-live="polite">
        <p class="hero-date">${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일</p>
        <div class="hero-main">
            <div><p class="hero-label">${esc(h.label)}</p><h2>${esc(h.title)}</h2></div>
            ${h.min != null ? `<p class="hero-num"><b>${h.min}</b><span>분 ${esc(h.cap)}</span></p>` : h.cap ? `<p class="hero-num"><span>${esc(h.cap)}</span></p>` : ''}
        </div>
        ${pct != null ? `<div class="bar" role="progressbar" aria-label="수업 진행" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>` : ''}
    </section>`;
}

const cleanName = s => String(s).replace(/\s*\(?[\d.]+\)?\s*$/, '');

function lunchRow(now, l) {
    const L = lunchToday();
    const isNow = l.from != null && now >= l.from && now < l.to;
    const past = l.to != null && now >= l.to;
    const names = L ? L.menu.map(cleanName).filter(Boolean) : [];
    const sub = L === undefined ? '급식 정보를 불러오는 중이에요'
        : L === null ? '오늘은 급식 정보가 없어요'
            : esc(names.slice(0, 4).join(', ')) + (names.length > 4 ? ' 외' : '');
    const time = l.from != null ? `${fmtMin(l.from)}~${fmtMin(l.to)}` : '';
    return `<li class="tl-row tl-lunch${isNow ? ' is-now' : past ? ' is-past' : ''}"><span class="tl-n">${icon('food')}</span>
        <a class="tl-body" href="#meal"><b>점심${time ? `<small class="tl-time">${time}</small>` : ''}</b><small>${sub}</small><span class="tl-go">${icon('chev')}</span></a></li>`;
}

function cleanRow() {
    const c = cleanSummary();
    return `<li class="tl-row tl-clean"><span class="tl-n">${icon('broom')}</span>
        <a class="tl-body" href="#cleaning"><b>종례 후 청소${c.mine ? ' <i class="tl-now">나</i>' : ''}</b><small>${esc(c.text)}${c.board ? `, 칠판 당번 ${esc(c.board)}` : ''}</small><span class="tl-go">${icon('chev')}</span></a></li>`;
}

function timeline(p, now) {
    if (p.weekend || p.empty) {
        return `<section class="card"><p class="m">${p.weekend ? '주말에는 수업이 없어요. 아래에서 다가오는 일정을 확인해 보세요.' : '선생님이 시간표를 올리면 여기에 하루 일정이 나와요.'}</p></section>`;
    }
    const items = [];
    p.rows.forEach((r, i) => {
        const st = r.range ? (now >= r.range[1] ? 'is-past' : now >= r.range[0] ? 'is-now' : '') : '';
        const meta = [r.t, r.time].filter(Boolean).join('  ');
        items.push(`<li class="tl-row ${st}"><span class="tl-n">${r.n}</span><div class="tl-body"><b>${esc(r.s || '-')}${st === 'is-now' ? ' <i class="tl-now">지금</i>' : ''}</b>${meta ? `<small>${esc(meta)}</small>` : ''}</div></li>`);
        if (p.lunch && p.lunch.after === i) items.push(lunchRow(now, p.lunch));
    });
    items.push(cleanRow());
    return `<section class="card tl-card"><ol class="tl">${items.join('')}</ol></section>`;
}

// ----- 아래쪽 카드 -----
function ddayCard() {
    const n = dday(EXAM.date);
    const d = atNoon(EXAM.date);
    const note = n > 0 ? '' : n === 0 ? ' · 오늘부터 시작해요!' : ' · 시험 기간이 시작됐어요';
    return `<section class="card dday-card"><h3>${esc(EXAM.name)} 디데이</h3><p class="dday-num">${ddayLabel(n)}</p><p class="m">${d.getMonth() + 1}월 ${d.getDate()}일(${WEEKDAYS[d.getDay()]}) 시작${note}</p></section>`;
}

const dutyCard = () => `<section class="card"><h3>내 1인1역</h3>${S.me.duty
    ? `<p class="duty-text">${esc(S.me.duty)}</p>`
    : '<p class="m">아직 정해진 역할이 없어요. 선생님께 물어보세요.</p>'}</section>`;

const eventsCard = () => `<section class="card"><h3>다가오는 일정</h3>${upcoming(7).map(e => evRow(e)).join('') || '<p class="m">7일 안에 예정된 일정이 없어요.</p>'}</section>`;

const todoCard = () => `<section class="card"><h3>내 할 일</h3>
    ${S.todos.map((t, i) => `<div class="todo"><input type="checkbox" id="todo-${i}" ${t.d ? 'checked' : ''} data-change="toggleTodo" data-i="${i}"><label for="todo-${i}" class="${t.d ? 'done' : ''}">${esc(t.t)}</label><button type="button" class="ghost" data-action="delTodo" data-i="${i}" aria-label="${esc(t.t)} 삭제">삭제</button></div>`).join('')}
    <form class="row" data-submit="addTodo"><input id="todo-new" maxlength="100" placeholder="할 일 입력 후 Enter" aria-label="새 할 일" data-keep><button>추가</button></form>
</section>`;

export function todayView() {
    const now = nowMinutes();
    const p = plan();
    const on = ddayOn();
    const builders = { dday: ddayCard, events: eventsCard, todo: todoCard, duty: dutyCard };
    const side = getOrder().filter(k => k !== 'dday' || on).map(k => builders[k]()).join('');
    return `${noticeBar()}
        <div class="today">
            <div class="today-main">${heroHtml(heroState(p, now))}${timeline(p, now)}</div>
            <div class="today-side">${side}
                <p class="dashboard-tools"><button type="button" class="ghost" data-action="openOrder">카드 순서 바꾸기</button><button type="button" class="ghost" data-action="toggleDday">기말고사 디데이 ${on ? '끄기' : '켜기'}</button></p>
            </div>
        </div>`;
}

// ----- 할 일 (화면을 먼저 바꾸고 저장은 뒤에서) -----
async function saveTodos() {
    try {
        await setDoc(refs.todo(S.me.uid), { items: S.todos }, { merge: true });
    } catch (e) {
        alert(e.message || '할 일을 저장하지 못했습니다.');
    }
}
function addTodo() {
    const el = $('#todo-new');
    const v = (el?.value || '').trim();
    if (!v) return;
    S.todos = [...S.todos, { t: v, d: 0 }];
    clearFields(el);
    requestRender();
    saveTodos();
}
function toggleTodo(el) {
    const i = Number(el.dataset.i);
    S.todos = S.todos.map((t, j) => (j === i ? { ...t, d: t.d ? 0 : 1 } : t));
    requestRender();
    saveTodos();
}
function delTodo(el) {
    const i = Number(el.dataset.i);
    S.todos = S.todos.filter((_, j) => j !== i);
    requestRender();
    saveTodos();
}

// ----- 카드 순서 -----
const orderListHtml = () => {
    const o = getOrder();
    return o.map((k, i) => `<div class="ev"><b>${CARDS[k]}</b><span class="ev-tools">
        <button type="button" class="ghost" data-action="moveCard" data-i="${i}" data-d="-1" data-key="mv-${k}-up" ${i === 0 ? 'disabled' : ''} aria-label="${CARDS[k]} 위로">▲</button>
        <button type="button" class="ghost" data-action="moveCard" data-i="${i}" data-d="1" data-key="mv-${k}-down" ${i === o.length - 1 ? 'disabled' : ''} aria-label="${CARDS[k]} 아래로">▼</button>
    </span></div>`).join('');
};

function openOrder() {
    openDialog('order-dlg', `<div class="panel">
        <div class="panel-head"><h2>카드 순서 바꾸기</h2><button type="button" data-action="closeDialog" data-id="order-dlg">완료</button></div>
        <p class="m">▲▼를 누르면 오늘 탭 아래쪽 카드 순서가 바로 바뀌어요. 이 기기에 저장돼요.</p>
        <div id="order-list"></div>
        <p><button type="button" class="ghost" data-action="resetOrder">기본 순서로</button></p>
    </div>`);
    refreshOrder();
}

export function refreshOrder() {
    if (isOpen('order-dlg')) patch($('#order-list'), orderListHtml());
}

function moveCard(el) {
    const o = getOrder();
    const i = Number(el.dataset.i);
    const j = i + Number(el.dataset.d);
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    local.set(orderKey(), o);
    requestRender();
}

export const actions = {
    addTodo, toggleTodo, delTodo, openOrder, moveCard,
    resetOrder: () => { local.set(orderKey(), DEFAULT_ORDER); requestRender(); },
    toggleDday: () => { local.set(ddayKey(), ddayOn() ? 0 : 1); requestRender(); }
};
