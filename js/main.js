// 앱 시작점: 로그인 상태, 실시간 구독, 화면 그리기, 버튼 동작 연결
import {
    auth, refs, LOGIN_DOMAIN, onAuthStateChanged, signInWithEmailAndPassword, signOut,
    updatePassword, EmailAuthProvider, reauthenticateWithCredential,
    onSnapshot, query, orderBy, limit
} from './firebase.js';
import { S, RN, isLeader, isStaff, onRender, requestRender, renderNow } from './store.js';
import { $, esc, today, isDate, local, patch } from './utils.js';
import { openDialog, closeDialog, closeAllDialogs } from './dialog.js';

import { todayView, refreshOrder, actions as todayActions } from './views/today.js';
import { refreshNotices, actions as noticeActions } from './views/notices.js';
import { calView, matchView, refreshAssess, actions as calActions } from './views/calendar.js';
import { cleaningView, normalizeCleaning, actions as cleaningActions } from './views/cleaning.js';
import { ttView, ttNormalize, actions as ttActions } from './views/timetable.js';
import { mealView, mealMounted, loadMeal, actions as mealActions } from './views/meal.js';
import { sgView, syncSuggestions, stopSuggestions, actions as sgActions } from './views/suggestions.js';
import { bannerDisplay, bannerManageView, bannersVisible, actions as bannerActions } from './views/banners.js';
import { dutyView, actions as dutyActions } from './views/duty.js';
import { adminView, actions as adminActions } from './views/admin.js';

const SESSION_KEY = 'maseok_session';   // 다음 방문 때 로그인 화면을 먼저 보여 줄지 정하는 힌트
const UI_KEY = 'classSite_ui';

// ----- 탭 -----
const TABS = [
    ['today', '⌂', '오늘'], ['timetable', '🕘', '시간표'], ['cal', '▦', '캘린더'], ['meal', '🍚', '급식'],
    ['match', '🏆', '대항전'], ['duty', '👤', '1인1역'], ['cleaning', '🧹', '청소'], ['suggest', '💬', '건의']
];
const QUICK = ['today', 'timetable', 'cal', 'meal', 'match'];
const tabsFor = () => [
    ...TABS,
    ...(isLeader() ? [['bannerManage', '🎉', '배너 관리']] : []),
    ...(isStaff() ? [['admin', '⚙', '관리']] : [])
];
const VIEWS = {
    today: { render: todayView },
    timetable: { render: ttView },
    cal: { render: calView },
    meal: { render: mealView, mounted: mealMounted },
    match: { render: matchView },
    duty: { render: dutyView },
    cleaning: { render: cleaningView },
    suggest: { render: sgView },
    bannerManage: { render: bannerManageView },
    admin: { render: adminView }
};

const tabFromHash = () => decodeURIComponent(location.hash.slice(1)) || 'today';
S.tab = tabFromHash();

// ----- 화면 그리기 -----
let lastTab = null;
let mealPrefetched = false;

const accountHtml = () => `
    <button type="button" class="menu-toggle" data-action="toggleMenu" aria-label="${S.menuOpen ? '메뉴 닫기' : '메뉴 열기'}" aria-expanded="${S.menuOpen}" aria-controls="side-rail"><span></span><span></span><span></span></button>
    <span class="account-name">${esc(S.me.name)}</span><i class="badge">${RN[S.me.role] || ''}</i>
    <button type="button" class="ghost on-dark" data-action="toggleBanners" aria-pressed="${bannersVisible()}">${bannersVisible() ? '📣 배너 켜짐' : '🔕 배너 꺼짐'}</button>
    <button type="button" class="ghost on-dark" data-action="openPassword">비밀번호 변경</button>
    <button type="button" class="ghost on-dark" data-action="logout">로그아웃</button>`;

const navHtml = tabs => tabs.map(([k, icon, label]) => `<a href="#${k}" class="nav-link${S.tab === k ? ' on' : ''}"${S.tab === k ? ' aria-current="page"' : ''} title="${label}"><span class="nav-icon" aria-hidden="true">${icon}</span><span class="nav-label">${label}</span></a>`).join('');

const quickHtml = tabs => {
    const have = new Set(tabs.map(t => t[0]));
    return tabs.filter(([k]) => QUICK.includes(k) && have.has(k))
        .map(([k, icon, label]) => `<a href="#${k}" class="${S.tab === k ? 'on' : ''}"${S.tab === k ? ' aria-current="page"' : ''}><span aria-hidden="true">${icon}</span><small>${label}</small></a>`).join('')
        + `<button type="button" data-action="toggleMenu" aria-label="전체 메뉴" aria-expanded="${S.menuOpen}"><span aria-hidden="true">☷</span><small>전체</small></button>`;
};

function render() {
    const root = document.documentElement;
    if (!S.authReady) return;
    if (!S.user) { root.dataset.view = 'login'; return; }
    if (!S.me || !S.cleaning || !S.timetable) { root.dataset.view = 'boot'; return; }
    root.dataset.view = 'app';

    const tabs = tabsFor();
    if (!tabs.some(t => t[0] === S.tab)) {
        S.tab = 'today';
        history.replaceState(null, '', '#today');
    }
    patch($('#account'), accountHtml());
    patch($('#side-nav'), navHtml(tabs));
    patch($('#quick-nav'), quickHtml(tabs));
    $('#layout').classList.toggle('menu-open', S.menuOpen);

    const view = $('#view');
    const changed = lastTab !== S.tab;
    patch(view, bannerDisplay() + VIEWS[S.tab].render(), { keep: !changed });
    if (changed) {
        lastTab = S.tab;
        view.classList.remove('enter');
        void view.offsetWidth;          // 애니메이션 다시 시작
        view.classList.add('enter');
        VIEWS[S.tab].mounted?.();
    }

    refreshNotices();
    refreshOrder();
    refreshAssess();

    // 첫 화면이 뜬 뒤 한가할 때 오늘 급식을 미리 받아 둡니다.
    if (!mealPrefetched) {
        mealPrefetched = true;
        const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1200));
        idle(() => loadMeal(today(), { silent: true }));
    }
}
onRender(render);

// ----- 로그인 상태와 실시간 구독 -----
let unsubs = [];
const unsubscribeAll = () => { unsubs.forEach(u => u()); unsubs = []; };
const watch = (ref, onData, onError = console.error) => unsubs.push(onSnapshot(ref, onData, onError));

function resetData() {
    Object.assign(S, {
        me: null, users: [], events: [], roles: [], todos: [], cleaning: null, timetable: null,
        notices: [], noticeErr: false, banners: [], menuOpen: false
    });
    lastTab = null;
}

function subscribe(user) {
    watch(refs.users, snap => {
        S.users = snap.docs.map(d => ({ ...d.data(), uid: d.id }));
        S.me = S.users.find(u => u.uid === user.uid) || null;
        if (!S.me) {
            alert('학생 프로필을 찾을 수 없습니다. 관리자에게 등록을 요청하세요.');
            signOut(auth);
            return;
        }
        syncSuggestions();
        requestRender();
    }, err => {
        console.error(err);
        alert('프로필을 읽을 수 없습니다. 계정 등록 여부와 Firestore 규칙을 확인해 주세요.');
        signOut(auth);
    });
    watch(refs.state, snap => {
        const data = snap.exists() ? snap.data() : {};
        S.events = (Array.isArray(data.events) ? data.events : [])
            .filter(e => e && isDate(e.date) && typeof e.title === 'string')
            .map(e => ({ ...e, id: String(e.id) }));
        S.roles = Array.isArray(data.roles) ? data.roles : [];
        requestRender();
    }, err => {
        console.error(err);
        alert('Firestore 연결을 확인해 주세요.');
    });
    watch(refs.cleaning, snap => {
        S.cleaning = normalizeCleaning(snap.exists() ? snap.data() : null);
        requestRender();
    }, err => {
        console.error(err);
        S.cleaning = normalizeCleaning(null);
        requestRender();
        alert('청소 설정을 읽을 수 없습니다. Firestore 규칙을 확인해 주세요.');
    });
    watch(refs.timetable, snap => {
        S.timetable = ttNormalize(snap.exists() ? snap.data().weeks : null);
        requestRender();
    }, err => {
        console.error(err);
        S.timetable = ttNormalize(null);
        requestRender();
    });
    watch(query(refs.banners, orderBy('createdAt', 'desc'), limit(50)), snap => {
        S.banners = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        requestRender();
    });
    watch(query(refs.notices, orderBy('createdAt', 'desc'), limit(50)), snap => {
        S.notices = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        S.noticeErr = false;
        requestRender();
    }, err => {
        console.error(err);
        S.noticeErr = true;
        requestRender();
    });
    watch(refs.todo(user.uid), snap => {
        const items = snap.exists() ? snap.data().items : [];
        S.todos = Array.isArray(items) ? items : [];
        requestRender();
    });
}

onAuthStateChanged(auth, user => {
    S.authReady = true;
    unsubscribeAll();
    stopSuggestions();
    closeAllDialogs();
    resetData();
    S.user = user;
    if (user) {
        local.set(SESSION_KEY, 1);
        subscribe(user);
    } else {
        local.remove(SESSION_KEY);
    }
    renderNow();
});

// ----- 로그인 · 로그아웃 · 비밀번호 -----
async function login() {
    const idEl = $('#li'), pwEl = $('#lp'), msg = $('#login-msg'), btn = $('#login-btn');
    const id = idEl.value.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(id)) {
        msg.textContent = '아이디는 영문·숫자와 . _ - 기호로 3~32자 입력해 주세요.';
        return idEl.focus();
    }
    btn.disabled = true;
    btn.textContent = '로그인 중…';
    msg.textContent = '';
    try {
        await signInWithEmailAndPassword(auth, `${id}@${LOGIN_DOMAIN}`, pwEl.value);
        pwEl.value = '';
    } catch (e) {
        msg.textContent = e.code === 'auth/too-many-requests'
            ? '시도가 너무 많아요. 잠시 후 다시 시도해 주세요.'
            : '아이디 또는 비밀번호를 확인해 주세요.';
        pwEl.select();
    } finally {
        btn.disabled = false;
        btn.textContent = '로그인';
    }
}

function openPassword() {
    openDialog('pw-dlg', `<form class="panel stack" data-submit="changePassword">
        <div class="panel-head"><h2>🔑 비밀번호 변경</h2><button type="button" class="ghost" data-action="closeDialog" data-id="pw-dlg">닫기 ✕</button></div>
        <label for="pw-cur">현재 비밀번호</label><input id="pw-cur" type="password" autocomplete="current-password" required>
        <label for="pw-new">새 비밀번호 (8자 이상)</label><input id="pw-new" type="password" autocomplete="new-password" minlength="8" required>
        <label for="pw-new2">새 비밀번호 확인</label><input id="pw-new2" type="password" autocomplete="new-password" minlength="8" required>
        <p id="pw-msg" class="m" role="alert"></p>
        <button id="pw-btn">비밀번호 변경</button>
    </form>`);
}

async function changePassword() {
    const cur = $('#pw-cur').value, next = $('#pw-new').value, again = $('#pw-new2').value;
    const msg = $('#pw-msg'), btn = $('#pw-btn');
    if (next.length < 8) return (msg.textContent = '새 비밀번호는 8자 이상이어야 해요.');
    if (next !== again) return (msg.textContent = '새 비밀번호 두 칸이 서로 달라요.');
    btn.disabled = true;
    msg.textContent = '';
    try {
        // 오래 로그인해 둔 상태에서도 바꿀 수 있도록 현재 비밀번호로 한 번 더 확인합니다.
        const user = auth.currentUser;
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, cur));
        await updatePassword(user, next);
        closeDialog('pw-dlg');
        alert('비밀번호를 바꿨어요.');
    } catch (e) {
        msg.textContent = ['auth/wrong-password', 'auth/invalid-credential'].includes(e.code)
            ? '현재 비밀번호가 맞지 않아요.'
            : e.code === 'auth/weak-password' ? '더 복잡한 비밀번호를 써 주세요.' : e.message || '비밀번호를 바꾸지 못했습니다.';
    } finally {
        btn.disabled = false;
    }
}

// ----- 화면 설정 (테마 · 효과) -----
let ui = local.get(UI_KEY, {}) || {};
function applyUI() {
    const r = document.documentElement;
    if (ui.t && ui.t !== 'system') r.dataset.theme = ui.t;
    else delete r.dataset.theme;
    r.dataset.fx = ui.fx === false ? 'off' : 'on';
    document.querySelectorAll('#settings [data-t]').forEach(b => {
        const on = b.dataset.t === (ui.t || 'system');
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on);
    });
    $('#fx').checked = ui.fx !== false;
}
function saveUI() {
    local.set(UI_KEY, ui);
    applyUI();
}
function setSettingsOpen(open) {
    $('#settings').classList.toggle('on', open);
    $('.fab').setAttribute('aria-expanded', open);
}

// ----- 메뉴 -----
function toggleMenu() {
    S.menuOpen = !S.menuOpen;
    requestRender();
}

// ----- 버튼·폼 동작 연결 (이벤트 위임) -----
// HTML에는 data-action="이름"만 적고, 실제 함수는 여기서 찾아 실행합니다.
// 사용자 데이터가 JS 코드 속에 들어가지 않으므로 XSS를 막을 수 있어요.
const ACTIONS = {
    ...todayActions, ...noticeActions, ...calActions, ...cleaningActions, ...ttActions,
    ...mealActions, ...sgActions, ...bannerActions, ...dutyActions, ...adminActions,
    login, openPassword, changePassword, toggleMenu,
    logout: () => signOut(auth),
    closeDialog: el => closeDialog(el.dataset.id),
    toggleSettings: () => setSettingsOpen(!$('#settings').classList.contains('on')),
    setTheme: el => { ui.t = el.dataset.t; saveUI(); },
    setFx: el => { ui.fx = el.checked; saveUI(); }
};

document.addEventListener('click', e => {
    if ($('#settings').classList.contains('on') && !e.target.closest('#settings, .fab')) setSettingsOpen(false);
    if (S.menuOpen && e.target.closest('.nav-link')) { S.menuOpen = false; requestRender(); }
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.action];
    if (!fn) return;
    if (el.tagName === 'A') e.preventDefault();
    fn(el, e);
});

document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches?.('[data-keep]')) t.dataset.dirty = '1';
    const el = t.closest?.('[data-change]');
    if (el) ACTIONS[el.dataset.change]?.(el, e);
});

document.addEventListener('input', e => {
    if (e.target.matches?.('[data-keep]')) e.target.dataset.dirty = '1';
});

document.addEventListener('submit', e => {
    const form = e.target.closest('form[data-submit]');
    if (!form) return;
    e.preventDefault();
    ACTIONS[form.dataset.submit]?.(form, e);
});

document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (S.menuOpen) { S.menuOpen = false; requestRender(); }
    if ($('#settings').classList.contains('on')) setSettingsOpen(false);
});

window.addEventListener('hashchange', () => {
    S.tab = tabFromHash();
    S.menuOpen = false;
    window.scrollTo({ top: 0 });
    requestRender();
});

// 자정이 지나면 '오늘'이 바뀌므로 화면을 새로 그립니다. 탭을 오래 열어 둬도 날짜가 맞아요.
function scheduleMidnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    setTimeout(() => { requestRender(); scheduleMidnight(); }, next - now);
}
scheduleMidnight();
document.addEventListener('visibilitychange', () => { if (!document.hidden) requestRender(); });

// ----- 시작 -----
applyUI();
const loginBtn = $('#login-btn');
loginBtn.disabled = false;
loginBtn.textContent = '로그인';
