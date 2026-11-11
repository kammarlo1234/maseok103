// 📢 공지사항: 오늘 탭의 공지 바 + 공지 대화상자
import { S, RN, isLeader } from '../store.js';
import { $, esc, fmtTime, uid, cldT, safeImg, patch, compressImage, clearFields } from '../utils.js';
import { refs, doc, setDoc, deleteDoc, uploadImage } from '../firebase.js';
import { openDialog, isOpen } from '../dialog.js';
import { icon } from '../icons.js';

const MAX_PHOTOS = 3;
const COOLDOWN_MS = 20000;
let pending = [];          // 올리기 전 사진 [{file, url}]
let lastPostedAt = 0;

const authorOf = n => S.users.find(u => u.uid === n.authorUid);
const authorName = n => authorOf(n)?.name || n.authorName || '알 수 없음';
const photosOf = n => (Array.isArray(n.photos) ? n.photos : []).filter(p => safeImg(p?.url));

export function noticeBar() {
    const n = S.notices[0];
    let body;
    if (S.noticeErr) {
        body = '<span class="nbar-text m">공지를 불러오지 못했어요</span>';
    } else if (!n) {
        body = '<span class="nbar-text m">아직 공지가 없어요. 눌러서 첫 공지를 써 보세요!</span>';
    } else {
        const pc = photosOf(n).length;
        const isNew = Date.now() - n.createdAt < 864e5;
        const text = String(n.text || (pc ? `사진 ${pc}장` : '')).replace(/\s+/g, ' ');
        body = `<span class="nbar-text">${isNew ? '<i class="tag-new">NEW</i>' : ''}${esc(authorName(n))}: ${pc ? '[사진] ' : ''}${esc(text)}</span>`;
    }
    return `<button type="button" class="card nbar" data-action="openNotices"><b class="nbar-label">${icon('mega')}공지</b>${body}<span class="m" aria-hidden="true">${icon('chev')}</span></button>`;
}

function listHtml() {
    if (S.noticeErr) return '<p class="m">공지를 불러오지 못했어요. 관리자에게 알려 주세요.</p>';
    if (!S.notices.length) return '<p class="m">아직 공지가 없어요.</p>';
    const canDelete = isLeader();
    return S.notices.map(n => {
        const role = authorOf(n)?.role;
        const photos = photosOf(n);
        return `<article class="item">
            <div class="item-head"><b>${esc(authorName(n))}</b>${role && role !== 'student' ? `<i class="badge">${RN[role] || ''}</i>` : ''}<span class="m">${fmtTime(n.createdAt)}</span>${canDelete ? `<button type="button" class="ghost push" data-action="delNotice" data-id="${esc(n.id)}">삭제</button>` : ''}</div>
            ${n.text ? `<p class="item-body">${esc(n.text)}</p>` : ''}
            ${photos.length ? `<div class="thumbs">${photos.map(p => `<button type="button" class="thumb" data-action="viewPhoto" data-url="${esc(p.url)}" aria-label="사진 크게 보기"><img src="${esc(cldT(p.url, 'w_400,h_400,c_fill,q_auto,f_auto'))}" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>` : ''}
        </article>`;
    }).join('');
}

const previewHtml = () => pending.map((p, i) => `<div class="preview"><img src="${p.url}" alt="첨부 미리보기 ${i + 1}"><button type="button" class="preview-x" data-action="removeNoticePhoto" data-i="${i}" aria-label="사진 빼기">✕</button></div>`).join('');

function clearPending() {
    pending.forEach(p => URL.revokeObjectURL(p.url));
    pending = [];
}

function setStatus(text) {
    const el = $('#nstatus');
    if (el) el.textContent = text;
}

function openNotices() {
    openDialog('notice-dlg', `<div class="panel">
        <div class="panel-head"><h2>공지사항</h2><button type="button" class="ghost" data-action="closeDialog" data-id="notice-dlg">닫기 ✕</button></div>
        <form class="row" data-submit="addNotice">
            <label class="sr-only" for="nin">공지 내용</label>
            <textarea id="nin" rows="2" maxlength="200" placeholder="공지 내용을 입력하세요 (200자 이내)"></textarea>
            <button id="nbtn">등록</button>
        </form>
        <div class="row">
            <label class="btn ghost">📷 사진 추가<input id="nfile" type="file" accept="image/*" multiple hidden data-change="pickNoticePhotos"></label>
            <span class="m">최대 ${MAX_PHOTOS}장 · 자동으로 줄여서 올려요</span>
        </div>
        <div id="nprev" class="previews"></div>
        <p id="nstatus" class="m" aria-live="polite"></p>
        <p class="m">누구나 등록할 수 있어요. 작성자 이름이 함께 표시되고, 장난글은 반장·부반장·선생님이 삭제할 수 있어요.</p>
        <div id="nlist"></div>
    </div>`, { onClose: clearPending });
    refreshNotices();
}

export function refreshNotices() {
    if (isOpen('notice-dlg')) patch($('#nlist'), listHtml());
}

async function pickNoticePhotos(input) {
    const files = [...(input.files || [])];
    input.value = '';
    if (!files.length) return;
    const room = MAX_PHOTOS - pending.length;
    if (room <= 0) return alert(`사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있어요.`);
    if (files.length > room) alert(`사진은 최대 ${MAX_PHOTOS}장까지라서 ${room}장만 추가할게요.`);
    setStatus('사진 준비 중...');
    for (const f of files.slice(0, room)) {
        if (!f.type.startsWith('image/')) { alert(`${f.name}은(는) 이미지가 아니에요.`); continue; }
        if (f.size > 25 * 1024 * 1024) { alert(`${f.name}은(는) 너무 커요. (25MB 이하)`); continue; }
        const out = await compressImage(f);
        if (out.size > 8 * 1024 * 1024) { alert(`${f.name}을(를) 줄이지 못했어요. 다른 사진을 골라 주세요.`); continue; }
        pending.push({ file: out, url: URL.createObjectURL(out) });
    }
    if (!isOpen('notice-dlg')) return clearPending();   // 준비 중에 창을 닫은 경우
    setStatus('');
    patch($('#nprev'), previewHtml(), { keep: false });
}

function removeNoticePhoto(el) {
    const i = Number(el.dataset.i);
    const p = pending[i];
    if (p) URL.revokeObjectURL(p.url);
    pending.splice(i, 1);
    patch($('#nprev'), previewHtml(), { keep: false });
}

async function addNotice() {
    const input = $('#nin');
    const text = (input?.value || '').trim();
    if (!text && !pending.length) return alert('공지 내용을 입력하거나 사진을 첨부해 주세요.');
    if (text.length > 200) return alert('200자 이내로 입력해 주세요.');
    if (Date.now() - lastPostedAt < COOLDOWN_MS) return alert('공지는 20초에 한 번만 등록할 수 있어요. 잠시 후 다시 시도해 주세요.');
    const btn = $('#nbtn');
    if (btn) btn.disabled = true;
    try {
        const photos = [];
        for (let i = 0; i < pending.length; i++) {
            setStatus(`사진 업로드 중... (${i + 1}/${pending.length})`);
            photos.push(await uploadImage(pending[i].file, 'maseok103/noticePhotos'));
        }
        setStatus('등록 중...');
        const id = uid();
        const data = { id, text, authorUid: S.me.uid, authorName: S.me.name, createdAt: Date.now() };
        if (photos.length) data.photos = photos;
        await setDoc(doc(refs.notices, id), data);
        lastPostedAt = Date.now();
        clearFields(input);
        clearPending();
        patch($('#nprev'), '', { keep: false });
    } catch (e) {
        console.error(e);
        alert(e.message || '공지를 등록하지 못했습니다.');
    } finally {
        setStatus('');
        const b = $('#nbtn');
        if (b) b.disabled = false;
    }
}

async function delNotice(el) {
    if (!isLeader()) return alert('반장, 부반장, 선생님, 개발자만 삭제할 수 있어요.');
    if (!confirm('이 공지를 삭제할까요?')) return;
    try {
        await deleteDoc(doc(refs.notices, el.dataset.id));
    } catch (e) {
        alert(e.message || '공지를 삭제하지 못했습니다.');
    }
}

function viewPhoto(el) {
    const url = safeImg(el.dataset.url);
    if (!url) return;
    openDialog('photo-dlg', `<img class="lightbox-img" src="${esc(cldT(url, 'w_1600,c_limit,q_auto,f_auto'))}" alt="사진 크게 보기">`, { bare: true });
}

export const actions = { openNotices, addNotice, delNotice, pickNoticePhotos, removeNoticePhoto, viewPhoto };
