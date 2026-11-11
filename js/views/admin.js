// ⚙ 관리: 학생·역할, 프로필 등록, 백업 (선생님·개발자)
import { S, LV, RN, lv, isStaff } from '../store.js';
import { $, esc, byKo, clearFields } from '../utils.js';
import { refs, doc, setDoc, updateDoc, deleteDoc, getDocs } from '../firebase.js';
import { normalizeCleaning } from './cleaning.js';

const isDev = () => S.me?.role === 'dev';
const canModify = u => (isDev() ? u.uid !== S.me.uid && u.role !== 'dev' : (LV[u.role] || 0) < lv());
const roleOptions = current => Object.keys(RN)
    .filter(k => k !== 'dev' && (isDev() || LV[k] < 3))
    .map(k => `<option value="${k}" ${k === current ? 'selected' : ''}>${RN[k]}</option>`).join('');

export function adminView() {
    if (!isStaff()) return '<section class="card"><p>관리 권한이 없습니다.</p></section>';
    const dev = isDev();
    const rows = S.users.slice().sort(byKo).map(u => `<div class="ev">
        <b>${esc(u.name)}</b><span class="m">${esc(u.id)}</span>
        <span class="ev-tools">${canModify(u)
            ? `<input value="${esc(u.name)}" aria-label="${esc(u.id)} 이름" data-keep data-key="adm-name-${esc(u.id)}" data-change="renameUser" data-id="${esc(u.id)}">
               <select aria-label="${esc(u.name)} 역할" data-change="setRole" data-id="${esc(u.id)}">${roleOptions(u.role)}</select>
               ${dev ? `<button type="button" class="ghost" data-action="pwInfo">비밀번호 안내</button><button type="button" class="ghost danger" data-action="revokeUser" data-id="${esc(u.id)}">접근 해제</button>` : ''}`
            : `<i class="badge">${RN[u.role] || ''}</i>`}</span>
    </div>`).join('');
    const register = !dev ? '' : `<section class="card"><h3>학생 프로필 등록</h3>
            <p class="m">먼저 Firebase Authentication에서 계정을 만들고, 그 계정의 UID를 입력하세요. 이메일은 아이디@maseok103.firebaseapp.com 형식으로 사용하고 비밀번호는 Firebase Authentication에서 관리합니다.</p>
            <form class="row" data-submit="registerUser">
                <input id="reg-name" placeholder="학생 이름" aria-label="학생 이름" data-keep required>
                <input id="reg-id" placeholder="아이디" aria-label="아이디" autocapitalize="off" autocomplete="off" data-keep required>
                <input id="reg-uid" placeholder="Firebase UID" aria-label="Firebase UID" autocomplete="off" data-keep required>
                <select id="reg-role" aria-label="역할" data-keep>${roleOptions('student')}</select>
                <input id="reg-duty" placeholder="1인 1역 (예: 칠판 지우기)" aria-label="1인 1역" data-keep>
                <button>프로필 등록</button>
            </form>
        </section>
        <section class="card"><h3>데이터 백업</h3>
            <p class="m">데이터는 Firebase Firestore에 저장됩니다.</p>
            <div class="row"><button type="button" data-action="exportBackup">내보내기</button>
            <label class="btn">불러오기<input type="file" accept=".json,application/json" hidden data-change="importBackup"></label></div>
        </section>`;
    return `<section class="card"><h3>학생·역할 관리</h3>${rows}</section>${register}`;
}

const findUser = id => S.users.find(x => x.id == id);

async function setRole(el) {
    const u = findUser(el.dataset.id);
    if (!u || !canModify(u)) return;
    try {
        await updateDoc(doc(refs.users, u.uid), { role: el.value });
    } catch (e) {
        alert(e.message || '권한을 변경하지 못했습니다.');
    }
}

async function renameUser(el) {
    const u = findUser(el.dataset.id);
    const value = el.value.trim();
    if (!u || !canModify(u)) return;
    if (!value) return alert('이름을 입력해 주세요.');
    try {
        await updateDoc(doc(refs.users, u.uid), { name: value });
        delete el.dataset.dirty;
    } catch (e) {
        alert(e.message || '이름을 수정하지 못했습니다.');
    }
}

async function revokeUser(el) {
    const u = findUser(el.dataset.id);
    if (!u || !isDev()) return;
    if (!confirm('사이트에서 이 계정의 접근을 해제할까요? Firebase Authentication 사용자도 콘솔에서 별도로 삭제해야 합니다.')) return;
    try {
        await deleteDoc(doc(refs.users, u.uid));
        await deleteDoc(refs.todo(u.uid));
    } catch (e) {
        alert(e.message || '계정을 해제하지 못했습니다.');
    }
}

async function registerUser() {
    if (!isDev()) return;
    const nameEl = $('#reg-name'), idEl = $('#reg-id'), uidEl = $('#reg-uid'), dutyEl = $('#reg-duty');
    const name = nameEl.value.trim();
    const id = idEl.value.trim().toLowerCase();
    const uid = uidEl.value.trim();
    if (!name || !id || !uid) return alert('Firebase Authentication에서 만든 계정의 이름, 아이디, UID를 입력해 주세요.');
    if (!/^[a-z0-9._-]{3,32}$/.test(id)) return alert('아이디는 영문·숫자와 . _ - 기호로 3~32자여야 합니다.');
    if (S.users.some(x => x.id == id || x.uid == uid)) return alert('이미 등록된 아이디 또는 UID입니다.');
    try {
        await setDoc(doc(refs.users, uid), { uid, id, name, role: $('#reg-role').value, duty: dutyEl.value.trim(), active: true });
        await setDoc(refs.todo(uid), { items: [] });
        clearFields(nameEl, idEl, uidEl, dutyEl);
        nameEl.focus();
    } catch (e) {
        alert(e.message || '학생 프로필을 등록하지 못했습니다.');
    }
}

async function exportBackup() {
    const backup = { users: S.users, events: S.events, roles: S.roles, cleaning: S.cleaning, todos: {} };
    try {
        if (isDev()) {
            const all = await getDocs(refs.todos);
            all.forEach(d => {
                backup.todos[S.users.find(u => u.uid === d.id)?.id || d.id] = d.data().items || [];
            });
        } else {
            backup.todos[S.me.id] = S.todos;
        }
    } catch (e) {
        alert(e.message || '할 일 목록을 읽지 못해 일부만 내보냅니다.');
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    a.download = `class-site-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importBackup(input) {
    const file = input.files?.[0];
    if (!file || !isDev()) return;
    try {
        const x = JSON.parse(await file.text());
        if (!Array.isArray(x.users) || !Array.isArray(x.events) || !Array.isArray(x.roles))
            throw new Error('백업 파일 형식이 올바르지 않습니다.');
        if (!confirm('이전 백업의 일정·역할·청소·할 일을 가져올까요? 같은 아이디의 새 계정이 이미 등록되어 있어야 합니다.')) return;
        await setDoc(refs.state, { events: x.events, roles: x.roles });
        await setDoc(refs.cleaning, normalizeCleaning(x.cleaning));
        const byId = new Map(x.users.map(u => [String(u.id).toLowerCase(), u]));
        for (const u of S.users) {
            const old = byId.get(String(u.id).toLowerCase());
            if (old) await updateDoc(doc(refs.users, u.uid), { duty: String(old.duty || '') });
            const items = old ? x.todos?.[old.id] || [] : [];
            await setDoc(refs.todo(u.uid), { items: Array.isArray(items) ? items : [] });
        }
        alert('이전 백업을 가져왔습니다. 계정 비밀번호는 이전되지 않습니다.');
    } catch (e) {
        alert(e.message || '백업 파일을 가져오지 못했습니다.');
    } finally {
        input.value = '';
    }
}

export const actions = {
    setRole, renameUser, revokeUser, registerUser, exportBackup, importBackup,
    pwInfo: () => alert('비밀번호 재설정은 Firebase 콘솔의 Authentication → 사용자에서 진행해 주세요.')
};
