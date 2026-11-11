// 📅 캘린더, 🏆 대항전, 수행평가 사진
import { S, isLeader, requestRender } from '../store.js';
import { $, esc, today, dday, ddayLabel, uid, isDate, safeImg, cldT, patch, clearFields, compressImage, WEEKDAYS } from '../utils.js';
import { db, refs, runTransaction, uploadImage } from '../firebase.js';
import { openDialog, isOpen } from '../dialog.js';

const byDate = (a, b) => a.date.localeCompare(b.date);
const photoCount = e => (Array.isArray(e.photos) ? e.photos.filter(p => safeImg(p?.url)).length : 0);

export const upcoming = days => S.events.filter(e => {
    const n = dday(e.date);
    return n >= 0 && n <= days;
}).sort(byDate);

// 일정 배열은 트랜잭션으로 고칩니다. 두 사람이 동시에 추가해도 한쪽이 사라지지 않아요.
async function mutateEvents(fn) {
    await runTransaction(db, async tx => {
        const snap = await tx.get(refs.state);
        const list = Array.isArray(snap.data()?.events) ? snap.data().events : [];
        tx.set(refs.state, { events: fn(list) }, { merge: true });
    });
}

export function evRow(e, withDelete = false) {
    const assess = e.type === 'assess';
    const inner = `<b>${ddayLabel(dday(e.date))}</b><i class="dot${e.type === 'match' ? ' is-match' : ''}" aria-hidden="true"></i><span>${esc(e.title)}</span><span class="m">${esc(e.date)} ${esc(e.detail)}</span>${assess && photoCount(e) ? `<span class="m">사진 ${photoCount(e)}장</span>` : ''}`;
    const main = assess
        ? `<button type="button" class="ev-main" data-action="openAssess" data-id="${esc(e.id)}">${inner}</button>`
        : `<div class="ev-main">${inner}</div>`;
    const del = withDelete && isLeader()
        ? `<span class="ev-tools"><button type="button" class="ghost" data-action="delEvent" data-id="${esc(e.id)}">삭제</button></span>`
        : '';
    return `<div class="ev${e.type === 'match' ? ' is-match' : ''}">${main}${del}</div>`;
}

const eventForm = type => !isLeader() ? '' : `<section class="card"><h3>일정 추가</h3>
    <form class="row" data-submit="addEvent">
        <select id="ev-type" aria-label="일정 종류" data-keep><option value="assess" ${type === 'assess' ? 'selected' : ''}>수행평가</option><option value="match" ${type === 'match' ? 'selected' : ''}>대항전</option></select>
        <input id="ev-date" type="date" value="${esc(S.sel)}" aria-label="날짜" data-keep>
        <input id="ev-title" maxlength="60" placeholder="제목 (예: 국어 발표)" aria-label="제목" data-keep>
        <input id="ev-detail" maxlength="120" placeholder="세부 내용 (시간·장소·준비물)" aria-label="세부 내용" data-keep>
        <button>추가</button>
    </form></section>`;

export function calView(filter = 'all') {
    const evs = filter === 'all' ? S.events : S.events.filter(e => e.type === filter);
    const y = S.calY, m = S.calM;
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
    const td = today();
    const map = new Map();
    for (const e of evs) {
        if (!e.date.startsWith(ym)) continue;
        if (!map.has(e.date)) map.set(e.date, []);
        map.get(e.date).push(e);
    }
    let cells = '<div class="cal-blank" aria-hidden="true"></div>'.repeat(first);
    for (let d = 1; d <= days; d++) {
        const s = `${ym}-${String(d).padStart(2, '0')}`;
        const chips = (map.get(s) || []).map(e => e.type === 'assess'
            ? `<button type="button" class="chip" data-action="openAssess" data-id="${esc(e.id)}">${esc(e.title)}${photoCount(e) ? ' 📷' : ''}</button>`
            : `<span class="chip is-match">${esc(e.title)}</span>`).join('');
        cells += `<div class="cal-cell${s === td ? ' is-today' : ''}${s === S.sel ? ' is-sel' : ''}" data-action="pick" data-date="${s}"><button type="button" class="cal-num" data-action="pick" data-date="${s}" aria-label="${m + 1}월 ${d}일 선택"${s === S.sel ? ' aria-pressed="true"' : ''}>${d}</button>${chips}</div>`;
    }
    const monthList = evs.filter(e => e.date.startsWith(ym)).sort(byDate);
    const sd = S.sel.split('-').map(Number);
    const selLabel = `${sd[1]}월 ${sd[2]}일 (${WEEKDAYS[new Date(sd[0], sd[1] - 1, sd[2]).getDay()]})`;
    const dayList = evs.filter(e => e.date === S.sel).sort(byDate);
    return `<section class="card">
            <div class="between"><button type="button" class="ghost" data-action="calMove" data-d="-1" aria-label="이전 달">◀</button><b>${y}년 ${m + 1}월</b><button type="button" class="ghost" data-action="calMove" data-d="1" aria-label="다음 달">▶</button></div>
            <div class="cal-grid">${[...WEEKDAYS].map(w => `<div class="cal-w">${w}</div>`).join('')}${cells}</div>
            <p class="m legend"><i class="dot"></i> 수행평가 <i class="dot is-match"></i> 대항전 &nbsp;날짜를 누르면 아래에 그날 일정이 나와요.</p>
        </section>
        <section class="card"><h3>${selLabel}</h3>${dayList.map(e => evRow(e, true)).join('') || '<p class="m">이 날은 일정이 없어요.</p>'}</section>
        ${eventForm(filter === 'match' ? 'match' : 'assess')}
        <section class="card"><h3>${m + 1}월 전체 일정</h3>${monthList.map(e => evRow(e, true)).join('') || '<p class="m">이 달에는 일정이 없어요.</p>'}</section>`;
}

export function matchView() {
    const list = S.events.filter(e => e.type === 'match').sort(byDate);
    const next = list.filter(e => dday(e.date) >= 0);
    const past = list.filter(e => dday(e.date) < 0).reverse();
    return `<section class="card"><h3>다가오는 경기</h3>${next.map(e => evRow(e, true)).join('') || '<p class="m">예정된 경기가 없어요.</p>'}</section>
        ${eventForm('match')}
        <section class="card"><h3>지난 경기</h3>${past.map(e => evRow(e, true)).join('') || '<p class="m">지난 경기가 없어요.</p>'}</section>`;
}

function pick(el) {
    S.sel = el.dataset.date;
    const f = $('#ev-date');
    if (f) {
        f.value = S.sel;
        f.dataset.dirty = '1';
    }
    requestRender();
}

function calMove(el) {
    let m = S.calM + Number(el.dataset.d);
    let y = S.calY;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    S.calM = m;
    S.calY = y;
    requestRender();
}

async function addEvent(form) {
    const type = $('#ev-type')?.value === 'match' ? 'match' : 'assess';
    const date = $('#ev-date')?.value;
    const title = ($('#ev-title')?.value || '').trim();
    const detail = ($('#ev-detail')?.value || '').trim();
    if (!isDate(date) || !title) return alert('날짜와 제목을 입력해 주세요.');
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
        await mutateEvents(list => [...list, { id: uid(), type, date, title, detail }]);
        S.sel = date;
        clearFields($('#ev-title'), $('#ev-detail'));
        requestRender();
    } catch (e) {
        alert(e.message || '일정을 저장하지 못했습니다.');
    } finally {
        btn.disabled = false;
    }
}

async function delEvent(el) {
    if (!isLeader() || !confirm('이 일정을 삭제할까요?')) return;
    const id = el.dataset.id;
    try {
        await mutateEvents(list => list.filter(e => e.id !== id));
    } catch (e) {
        alert(e.message || '일정을 삭제하지 못했습니다.');
    }
}

// ----- 수행평가 사진 -----
let assessId = null;
const canUploadAssess = () => ['pres', 'vice'].includes(S.me?.role);

function assessPhotosHtml(e) {
    const photos = (Array.isArray(e.photos) ? e.photos : []).filter(p => safeImg(p?.url));
    const grid = photos.map((p, i) => {
        const name = p.name || `사진 ${i + 1}`;
        return `<a class="photo-card" href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(cldT(p.url, 'w_400,h_300,c_fill,q_auto,f_auto'))}" alt="${esc(name)}" loading="lazy" decoding="async"><span>${esc(name)}</span></a>`;
    }).join('');
    return `<h3>수행평가 자료 사진 (${photos.length})</h3>${grid ? `<div class="photo-grid">${grid}</div>` : '<p class="m">아직 등록된 사진이 없습니다.</p>'}`;
}

function openAssess(el) {
    const e = S.events.find(x => x.id === el.dataset.id && x.type === 'assess');
    if (!e) return;
    assessId = e.id;
    openDialog('assess-dlg', `<div class="panel">
        <div class="panel-head"><div><h2>${esc(e.title)}</h2><p class="m">${esc(e.date)} · 수행평가</p></div><button type="button" class="ghost" data-action="closeDialog" data-id="assess-dlg">닫기 ✕</button></div>
        <p class="item-body">${esc(e.detail || '등록된 세부 내용이 없습니다.')}</p>
        <div id="assess-photos"></div>
        ${canUploadAssess() ? `<hr class="sep"><h3>사진 추가 (반장·부반장 전용)</h3>
        <p class="m">JPG, PNG, WEBP · 자동으로 줄여서 올려요</p>
        <div class="row"><input id="assess-files" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="올릴 사진 선택"><button type="button" data-action="uploadAssess" data-id="${esc(e.id)}">사진 업로드</button></div>
        <p id="assess-status" class="m" aria-live="polite"></p>` : ''}
    </div>`, { onClose: () => { assessId = null; } });
    refreshAssess();
}

export function refreshAssess() {
    if (!assessId || !isOpen('assess-dlg')) return;
    const e = S.events.find(x => x.id === assessId);
    patch($('#assess-photos'), e ? assessPhotosHtml(e) : '<p class="m">이 일정은 삭제되었어요.</p>');
}

async function uploadAssess(el) {
    if (!canUploadAssess()) return alert('반장 또는 부반장만 사진을 업로드할 수 있습니다.');
    const id = el.dataset.id;
    const input = $('#assess-files');
    const status = $('#assess-status');
    const files = [...(input?.files || [])];
    if (!files.length) return alert('업로드할 사진을 선택해 주세요.');
    if (files.some(f => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 25 * 1024 * 1024))
        return alert('25MB 이하의 JPG, PNG, WEBP 사진만 올릴 수 있습니다.');
    el.disabled = true;
    try {
        const added = [];
        for (const f of files) {
            status.textContent = `${f.name} 업로드 중...`;
            const out = await compressImage(f);
            if (out.size > 8 * 1024 * 1024) throw new Error(`${f.name}을(를) 8MB 이하로 줄이지 못했습니다.`);
            const r = await uploadImage(out, `maseok103/assessmentPhotos/${id}`);
            added.push({ ...r, name: f.name, uploadedBy: S.me.id, uploadedAt: new Date().toISOString() });
        }
        await mutateEvents(list => list.map(x => x.id === id
            ? { ...x, photos: [...(Array.isArray(x.photos) ? x.photos : []), ...added] }
            : x));
        input.value = '';
        status.textContent = `사진 ${added.length}장을 올렸어요.`;
    } catch (err) {
        console.error(err);
        status.textContent = '업로드에 실패했습니다.';
        alert(err.message || '사진을 업로드하지 못했습니다.');
    } finally {
        el.disabled = false;
    }
}

export const actions = { pick, calMove, addEvent, delEvent, openAssess, uploadAssess };
