// 💬 건의함: 학급 건의 / 사이트 건의
// 학생은 자기가 보낸 건의만, 반장·부반장은 학급 건의까지, 선생님·개발자는 전체를 봅니다.
import { S, lv, isStaff, requestRender } from '../store.js';
import { $, esc, fmtTime, uid, clearFields } from '../utils.js';
import { refs, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, limit } from '../firebase.js';

const CAT = { class: '🏫 학급', site: '💻 사이트' };
const COOLDOWN_MS = 30000;
let cat = 'class';
let filter = 'all';
let lastSentAt = 0;
let stop = null;
let subKey = '';

const isLeaderOnly = () => lv() === 2;

export function stopSuggestions() {
    stop?.();
    stop = null;
    subKey = '';
    S.suggestions = [];
    S.sgErr = false;
}

/** 로그인한 사람의 권한에 맞게 실시간 구독을 맞춥니다. 권한이 그대로면 아무것도 안 해요. */
export function syncSuggestions() {
    if (!S.me) return stopSuggestions();
    const mode = lv() >= 3 ? 'staff' : lv() === 2 ? 'leader' : 'student';
    const key = `${S.me.uid}:${mode}`;
    if (key === subKey && stop) return;
    stopSuggestions();
    subKey = key;
    const parts = {};
    const apply = (name, snap) => {
        parts[name] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        const merged = new Map();
        Object.values(parts).flat().forEach(s => merged.set(s.id, s));
        S.suggestions = [...merged.values()];
        S.sgErr = false;
        requestRender();
    };
    const onErr = err => {
        console.error(err);
        S.sgErr = true;
        requestRender();
    };
    const subs = [];
    if (mode === 'staff') {
        subs.push(onSnapshot(query(refs.suggestions, orderBy('createdAt', 'desc'), limit(200)), s => apply('all', s), onErr));
    } else {
        subs.push(onSnapshot(query(refs.suggestions, where('authorUid', '==', S.me.uid), limit(100)), s => apply('mine', s), onErr));
        if (mode === 'leader') {
            subs.push(onSnapshot(query(refs.suggestions, where('category', '==', 'class'), limit(200)), s => apply('class', s), onErr));
        }
    }
    stop = () => subs.forEach(u => u());
}

function itemHtml(s, staff, showWho) {
    const done = s.status === 'done';
    const who = showWho ? `<b>${s.anonymous ? '익명' : esc(s.authorName || '알 수 없음')}</b>` : '';
    const tools = staff
        ? `<span class="push row-tight"><button type="button" class="ghost" data-action="sgToggle" data-id="${esc(s.id)}">${done ? '되돌리기' : '처리완료'}</button><button type="button" class="ghost" data-action="sgDelete" data-id="${esc(s.id)}">삭제</button></span>`
        : '';
    return `<article class="item"><div class="item-head">${who}<i class="badge">${CAT[s.category] || ''}</i><i class="badge ${done ? 'is-done' : 'is-new'}">${done ? '처리완료' : '접수됨'}</i><span class="m">${fmtTime(s.createdAt)}</span>${tools}</div><p class="item-body">${esc(s.text)}</p></article>`;
}

function listHtml() {
    if (S.sgErr) return '<p class="m">건의 목록을 불러오지 못했어요. Firestore 규칙에 suggestions 허용이 들어갔는지 확인해 주세요.</p>';
    const staff = isStaff();
    let rows = S.suggestions.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (staff && filter !== 'all') rows = rows.filter(s => s.category === filter);
    if (!rows.length) return `<p class="m">${staff ? '받은 건의가 없어요.' : isLeaderOnly() ? '볼 수 있는 건의가 없어요.' : '아직 보낸 건의가 없어요.'}</p>`;
    return rows.map(s => itemHtml(s, staff, staff || isLeaderOnly())).join('');
}

export function sgView() {
    const staff = isStaff();
    const catBtn = k => `<button type="button" class="${cat === k ? '' : 'ghost'}" data-action="sgCat" data-k="${k}" aria-pressed="${cat === k}">${CAT[k]}</button>`;
    const count = k => S.suggestions.filter(s => k === 'all' || s.category === k).length;
    const filterBtn = (k, label) => `<button type="button" class="${filter === k ? '' : 'ghost'}" data-action="sgFilter" data-k="${k}" aria-pressed="${filter === k}">${label} ${count(k)}</button>`;
    const hint = cat === 'class'
        ? '학급 운영, 자리, 행사, 규칙 등 우리 반에 바라는 점을 적어 주세요. 선생님, 개발자, 반장, 부반장이 볼 수 있어요.'
        : '사이트의 오류, 불편한 점, 있었으면 하는 기능을 적어 주세요. 선생님과 개발자만 볼 수 있어요.';
    const title = staff ? '📥 받은 건의함' : isLeaderOnly() ? '📥 학급 건의 · 내가 보낸 건의' : '📮 내가 보낸 건의';
    return `<section class="card"><h3>건의사항 보내기</h3>
            <div class="row">${catBtn('class')}${catBtn('site')}</div>
            <p class="m">${hint}</p>
            <form data-submit="sgSend">
                <label class="sr-only" for="sg-in">건의 내용</label>
                <textarea id="sg-in" rows="4" maxlength="300" placeholder="건의 내용을 입력하세요 (300자 이내)" data-keep></textarea>
                <label class="todo"><input id="sg-anon" type="checkbox" data-keep><span>익명으로 보내기</span></label>
                <button id="sg-btn">보내기</button>
            </form>
            <p class="m">익명으로 보내면 화면에는 이름이 표시되지 않아요.</p>
        </section>
        <section class="card"><h3>${title}</h3>
            ${staff ? `<div class="row">${filterBtn('all', '전체')}${filterBtn('class', '학급')}${filterBtn('site', '사이트')}</div>` : ''}
            ${listHtml()}
        </section>`;
}

async function sgSend() {
    if (!S.me) return;
    const input = $('#sg-in');
    const anon = $('#sg-anon');
    const text = (input?.value || '').trim();
    if (!text) return alert('건의 내용을 입력해 주세요.');
    if (text.length > 300) return alert('300자 이내로 입력해 주세요.');
    if (Date.now() - lastSentAt < COOLDOWN_MS) return alert('건의는 30초에 한 번만 보낼 수 있어요. 잠시 후 다시 시도해 주세요.');
    const btn = $('#sg-btn');
    if (btn) btn.disabled = true;
    try {
        const id = uid();
        const anonymous = !!anon?.checked;
        await setDoc(doc(refs.suggestions, id), {
            id,
            category: cat,
            text,
            anonymous,
            authorUid: S.me.uid,
            authorName: anonymous ? '' : S.me.name || '',
            createdAt: Date.now(),
            status: 'new'
        });
        lastSentAt = Date.now();
        clearFields(input, anon);
        alert('건의가 전달되었어요. 고마워요!');
    } catch (e) {
        alert(e.message || '건의를 보내지 못했습니다.');
    } finally {
        const b = $('#sg-btn');
        if (b) b.disabled = false;
    }
}

async function sgToggle(el) {
    if (!isStaff()) return;
    const s = S.suggestions.find(x => x.id === el.dataset.id);
    if (!s) return;
    try {
        await updateDoc(doc(refs.suggestions, s.id), { status: s.status === 'done' ? 'new' : 'done' });
    } catch (e) {
        alert(e.message || '상태를 바꾸지 못했습니다.');
    }
}

async function sgDelete(el) {
    if (!isStaff()) return alert('선생님, 개발자만 삭제할 수 있어요.');
    if (!confirm('이 건의를 삭제할까요?')) return;
    try {
        await deleteDoc(doc(refs.suggestions, el.dataset.id));
    } catch (e) {
        alert(e.message || '건의를 삭제하지 못했습니다.');
    }
}

export const actions = {
    sgSend, sgToggle, sgDelete,
    sgCat: el => { cat = el.dataset.k === 'site' ? 'site' : 'class'; requestRender(); },
    sgFilter: el => { filter = ['class', 'site'].includes(el.dataset.k) ? el.dataset.k : 'all'; requestRender(); }
};
