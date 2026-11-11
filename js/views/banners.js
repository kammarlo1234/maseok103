// 🎉 특별 배너 (반장·부반장·선생님·개발자가 관리)
import { S, isLeader, requestRender } from '../store.js';
import { $, esc, today, uid, isDate, local, clearFields } from '../utils.js';
import { refs, doc, setDoc, updateDoc, deleteDoc } from '../firebase.js';

const CATS = ['대항전', '행사', '수상·순위', '학급 소식', '기타'];
const EMOJIS = ['📣', '🏆', '🥇', '🥈', '🥉', '🎉', '🔥', '💪', '👏', '⚡', '📢', '🎊', '😢', '💙', '⭐'];
let editingId = null;

const prefKey = () => `maseok_banner_visible_${S.me?.uid || 'guest'}`;
export const bannersVisible = () => local.get(prefKey(), 1) != 0;

export function bannerDisplay() {
    if (!bannersVisible()) return '';
    const td = today();
    const active = S.banners.filter(b => b.active !== false && (!b.endDate || b.endDate >= td));
    if (!active.length) return '';
    return `<div class="banner-stack">${active.map(b => `<article class="event-banner">
        <p class="banner-tag">${esc(b.category || '특별 소식')}</p>
        <h2><span class="banner-emoji" aria-hidden="true">${esc(b.emoji || '📣')}</span>${esc(b.title || '특별 소식')}</h2>
        <p class="banner-text">${esc(b.content || '')}</p>
        ${b.authorName ? `<p class="banner-by">작성 · ${esc(b.authorName)}</p>` : ''}
    </article>`).join('')}</div>`;
}

export function bannerManageView() {
    if (!isLeader()) return '<section class="card"><p>배너 관리 권한이 없습니다.</p></section>';
    const editing = editingId ? S.banners.find(b => b.id === editingId) : null;
    if (editingId && !editing) editingId = null;   // 수정 중이던 배너가 삭제됨
    const cats = editing?.category && !CATS.includes(editing.category) ? [...CATS, editing.category] : CATS;
    const emojis = editing?.emoji && !EMOJIS.includes(editing.emoji) ? [...EMOJIS, editing.emoji] : EMOJIS;
    const list = S.banners.map(b => `<div class="ev banner-row">
        <div class="grow"><b>${esc(b.emoji || '📣')} ${esc(b.title)}</b>
            <p class="m">${esc(b.category || '')} · ${b.active === false ? '비공개' : '게시 중'}${b.endDate ? ' · 종료 ' + esc(b.endDate) : ''}</p>
            <p class="item-body">${esc(b.content || '')}</p></div>
        <span class="ev-tools">
            <button type="button" class="ghost" data-action="toggleBanner" data-id="${esc(b.id)}" data-next="${b.active === false ? 1 : 0}">${b.active === false ? '게시' : '숨기기'}</button>
            <button type="button" class="ghost" data-action="editBanner" data-id="${esc(b.id)}">수정</button>
            <button type="button" class="ghost" data-action="deleteBanner" data-id="${esc(b.id)}">삭제</button>
        </span></div>`).join('');
    return `<section class="card" id="banner-form-card"><h3>${editing ? '✏️ 배너 수정' : '🎉 특별 배너 만들기'}</h3>
            <p class="m">대항전 결과, 행사 순위, 학급 소식 등을 알리는 배너입니다. 반장·부반장·선생님이 등록·수정·삭제할 수 있습니다.</p>
            <form data-submit="saveBanner">
                <div class="row">
                    <select id="bn-category" aria-label="분류" data-keep>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select>
                    <select id="bn-emoji" aria-label="이모지" data-keep>${emojis.map(e => `<option>${esc(e)}</option>`).join('')}</select>
                </div>
                <div class="row"><input id="bn-title" maxlength="60" placeholder="배너 제목 (예: 대항전 우승!)" aria-label="배너 제목" data-keep></div>
                <textarea id="bn-content" rows="3" maxlength="500" placeholder="배너 내용 (최대 500자)" aria-label="배너 내용" data-keep></textarea>
                <div class="row">
                    <label class="todo"><input id="bn-active" type="checkbox" checked data-keep><span>게시하기</span></label>
                    <label class="inline-label">게시 종료일 (선택) <input id="bn-end" type="date" data-keep></label>
                </div>
                <div class="row">
                    <button>${editing ? '수정 저장' : '배너 등록'}</button>
                    ${editing ? '<button type="button" class="ghost" data-action="cancelBannerEdit">수정 취소</button>' : ''}
                </div>
            </form>
        </section>
        <section class="card"><h3>🗂 배너 관리</h3>${list || '<p class="m">등록된 배너가 없습니다.</p>'}</section>`;
}

const fields = () => ['#bn-category', '#bn-emoji', '#bn-title', '#bn-content', '#bn-active', '#bn-end'].map(s => $(s));

function resetForm() {
    const [category, emoji, ...rest] = fields();
    clearFields(...rest);
    [category, emoji].forEach(el => { if (el) { el.selectedIndex = 0; delete el.dataset.dirty; } });
}

async function saveBanner() {
    if (!isLeader()) return alert('배너 관리 권한이 없습니다.');
    const [category, emoji, titleEl, contentEl, active, end] = fields();
    const title = titleEl.value.trim();
    const content = contentEl.value.trim();
    if (!title || !content) return alert('제목과 내용을 모두 입력해 주세요.');
    const data = {
        title, content,
        category: category.value,
        emoji: emoji.value,
        active: active.checked,
        endDate: isDate(end.value) ? end.value : '',
        updatedAt: Date.now()
    };
    try {
        if (editingId) {
            await updateDoc(doc(refs.banners, editingId), data);
            editingId = null;
        } else {
            const id = uid();
            await setDoc(doc(refs.banners, id), { ...data, id, authorUid: S.me.uid, authorName: S.me.name, createdAt: Date.now() });
        }
        resetForm();
        requestRender();
        alert('배너를 저장했습니다.');
    } catch (e) {
        alert(e.message || '배너를 저장하지 못했습니다.');
    }
}

function editBanner(el) {
    const b = S.banners.find(x => x.id === el.dataset.id);
    if (!b) return;
    editingId = b.id;
    requestRender();
    // 화면이 다시 그려진 뒤 칸을 채웁니다.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const [category, emoji, title, content, active, end] = fields();
        if (!title) return;
        category.value = b.category || CATS[0];
        emoji.value = b.emoji || '📣';
        title.value = b.title || '';
        content.value = b.content || '';
        active.checked = b.active !== false;
        end.value = b.endDate || '';
        fields().forEach(f => { f.dataset.dirty = '1'; });
        $('#banner-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        title.focus({ preventScroll: true });
    }));
}

function cancelBannerEdit() {
    editingId = null;
    resetForm();
    requestRender();
}

async function toggleBanner(el) {
    if (!isLeader()) return alert('권한이 없습니다.');
    try {
        await updateDoc(doc(refs.banners, el.dataset.id), { active: el.dataset.next === '1', updatedAt: Date.now() });
    } catch (e) {
        alert(e.message || '변경에 실패했습니다.');
    }
}

async function deleteBanner(el) {
    if (!isLeader() || !confirm('이 배너를 삭제할까요?')) return;
    try {
        await deleteDoc(doc(refs.banners, el.dataset.id));
        if (editingId === el.dataset.id) cancelBannerEdit();
    } catch (e) {
        alert(e.message || '삭제에 실패했습니다.');
    }
}

function toggleBanners() {
    local.set(prefKey(), bannersVisible() ? 0 : 1);
    requestRender();
}

export const actions = { saveBanner, editBanner, cancelBannerEdit, toggleBanner, deleteBanner, toggleBanners };
