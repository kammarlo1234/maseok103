// 👤 1인 1역 임무표
import { S, isLeader, students } from '../store.js';
import { esc, byKo } from '../utils.js';
import { refs, doc, updateDoc } from '../firebase.js';

export function dutyView() {
    const editable = isLeader();
    const rows = students().sort(byKo).map(u => `<div class="ev"><b>${esc(u.name)}</b>${editable
        ? `<input class="grow" value="${esc(u.duty || '')}" placeholder="맡은 역할 (예: 칠판 지우기)" aria-label="${esc(u.name)}의 역할" data-keep data-key="duty-${esc(u.id)}" data-change="setDuty" data-id="${esc(u.id)}">`
        : `<span>${esc(u.duty || '아직 없음')}</span>`}</div>`).join('');
    return `<section class="card"><h3>🎯 1인 1역 임무표</h3>${rows || '<p class="m">아직 학생 계정이 없어요.</p>'}${editable ? '<p class="m">칸에 적고 다른 곳을 누르면 바로 저장돼요.</p>' : ''}</section>`;
}

async function setDuty(el) {
    if (!isLeader()) return;
    const u = S.users.find(x => x.id == el.dataset.id);
    if (!u) return;
    try {
        await updateDoc(doc(refs.users, u.uid), { duty: el.value.trim() });
        delete el.dataset.dirty;
    } catch (e) {
        alert(e.message || '역할을 저장하지 못했습니다.');
    }
}

export const actions = { setDuty };
