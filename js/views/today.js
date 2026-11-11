// ⌂ 오늘 탭: 공지, 디데이, 청소, 1인1역, 일정, 할 일
import { S, requestRender } from '../store.js';
import { $, esc, dday, ddayLabel, atNoon, WEEKDAYS, local, patch, clearFields } from '../utils.js';
import { refs, setDoc } from '../firebase.js';
import { openDialog, isOpen } from '../dialog.js';
import { noticeBar } from './notices.js';
import { cleanTodayCard } from './cleaning.js';
import { upcoming, evRow } from './calendar.js';

const CARDS = {
    notice: '📢 공지',
    dday: '📝 기말고사 디데이',
    clean: '🧹 오늘의 청소',
    duty: '🎯 내 1인1역',
    events: '📅 7일 안의 일정',
    todo: '✅ 내 할 일'
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

function ddayCard() {
    const n = dday(EXAM.date);
    const d = atNoon(EXAM.date);
    const note = n > 0 ? '' : n === 0 ? ' · 오늘부터 시작해요!' : ' · 시험 기간이 시작됐어요';
    return `<section class="card dday-card"><h3>📝 ${esc(EXAM.name)} 디데이</h3><p class="dday-num">${ddayLabel(n)}</p><p class="m">${d.getMonth() + 1}월 ${d.getDate()}일(${WEEKDAYS[d.getDay()]}) 시작${note}</p></section>`;
}

const dutyCard = () => `<section class="card"><h3>🎯 내 1인1역</h3>${S.me.duty
    ? `<p class="duty-text">${esc(S.me.duty)}</p>`
    : '<p class="m">아직 정해진 역할이 없어요. 선생님께 물어보세요.</p>'}</section>`;

const eventsCard = () => `<section class="card"><h3>📅 7일 안의 일정</h3>${upcoming(7).map(e => evRow(e)).join('') || '<p class="m">예정된 일정이 없어요.</p>'}</section>`;

const todoCard = () => `<section class="card"><h3>✅ 내 할 일</h3>
    ${S.todos.map((t, i) => `<div class="todo"><input type="checkbox" id="todo-${i}" ${t.d ? 'checked' : ''} data-change="toggleTodo" data-i="${i}"><label for="todo-${i}" class="${t.d ? 'done' : ''}">${esc(t.t)}</label><button type="button" class="ghost" data-action="delTodo" data-i="${i}" aria-label="${esc(t.t)} 삭제">삭제</button></div>`).join('')}
    <form class="row" data-submit="addTodo"><input id="todo-new" maxlength="100" placeholder="할 일 입력 후 Enter" aria-label="새 할 일" data-keep><button>추가</button></form>
</section>`;

export function todayView() {
    const builders = { notice: noticeBar, dday: ddayCard, clean: cleanTodayCard, duty: dutyCard, events: eventsCard, todo: todoCard };
    const on = ddayOn();
    const cards = getOrder().filter(k => k !== 'dday' || on).map(k => builders[k]()).join('');
    return `<div class="dashboard-grid">${cards}</div>
        <p class="dashboard-tools"><button type="button" class="ghost" data-action="openOrder">↕ 카드 순서 바꾸기</button><button type="button" class="ghost" data-action="toggleDday">📝 기말고사 디데이 ${on ? '끄기' : '켜기'}</button></p>`;
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
        <div class="panel-head"><h2>↕ 카드 순서 바꾸기</h2><button type="button" data-action="closeDialog" data-id="order-dlg">완료</button></div>
        <p class="m">▲▼를 누르면 오늘 탭 카드 순서가 바로 바뀌어요. 이 기기에 저장돼요.</p>
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
