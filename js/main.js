// 앱 시작점: 로그인 상태, 실시간 구독, 화면 그리기, 버튼 동작 연결
import {
    auth, refs, LOGIN_DOMAIN, onAuthStateChanged, signInWithEmailAndPassword, signOut,
    updatePassword, EmailAuthProvider, reauthenticateWithCredential,
    onSnapshot, query, orderBy, limit
} from './firebase.js';
import { S, RN, isLeader, isStaff, onRender, requestRender, renderNow } from './store.js';
import { $, esc, isDate, local, patch } from './utils.js';
import { openDialog, closeDialog, closeAllDialogs } from './dialog.js';
import { applyUI, themeActions } from './theme.js';
import { icon } from './icons.js';

import { todayView, refreshOrder, actions as todayActions } from './views/today.js';
import { refreshNotices, actions as noticeActions } from './views/notices.js';
import { calView, matchView, refreshAssess, actions as calActions } from './views/calendar.js';
import { cleaningView, normalizeCleaning, actions as cleaningActions } from './views/cleaning.js';
import { ttView, ttNormalize, actions as ttActions } from './views/timetable.js';
import { mealView, mealMounted, prefetchToday, actions as mealActions } from './views/meal.js';
import { sgView, syncSuggestions, stopSuggestions, actions as sgActions } from './views/suggestions.js';
import { bannerDisplay, bannerManageView, actions as bannerActions } from './views/banners.js';
import { dutyView, actions as dutyActions } from './views/duty.js';
import { adminView, actions as adminActions } from './views/admin.js';
import { refreshMe, actions as meActions } from './views/me.js';

const SESSION_KEY = 'maseok_session';   // 다음 방문 때 로그인 화면을 먼저 보여 줄지 정하는 힌트

// 상단 시계는 기기 시간대를 따라 매초 갱신합니다.
const topClock = $('#top-clock');
const updateTopClock = () => {
    const now = new Date();
    topClock.textContent = new Intl.DateTimeFormat('ko-KR', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(now);
    topClock.dateTime = now.toISOString();
};
updateTopClock();
setInterval(updateTopClock, 1000);

// ----- 탭: 아래(큰 화면에선 왼쪽) 메뉴는 4개만 -----
const TABS = [['today', 'home', '오늘'], ['timetable', 'clock', '시간표'], ['schedule', 'cal', '일정'], ['us', 'users', '우리 반']];

// 예전 주소(#cal, #match, #cleaning ...)도 새 탭으로 이어 줍니다.
const ALIAS = {
    cal: ['schedule', 'all'], match: ['schedule', 'match'],
    cleaning: ['us', 'clean'], duty: ['us', 'duty'], suggest: ['us', 'suggest'],
    bannerManage: ['us', 'banner'], admin: ['us', 'admin']
};

const FILTERS = [['all', '전체'], ['assess', '수행평가'], ['match', '대항전']];
const scheduleView = () => `<div class="segs" role="group" aria-label="일정 종류">${FILTERS.map(([k, label]) =>
    `<button type="button" class="${S.filter === k ? 'on' : ''}" data-action="setFilter" data-v="${k}" aria-pressed="${S.filter === k}">${label}</button>`).join('')}</div>
    ${S.filter === 'match' ? matchView() : calView(S.filter)}`;

const secsFor = () => [
    ['clean', '청소·당번'], ['duty', '1인1역'], ['suggest', '건의'],
    ...(isLeader() ? [['banner', '배너']] : []),
    ...(isStaff() ? [['admin', '관리']] : [])
];
const SEC_VIEW = { clean: cleaningView, duty: dutyView, suggest: sgView, banner: bannerManageView, admin: adminView };
function usView() {
    const secs = secsFor();
    if (!secs.some(x => x[0] === S.sec)) S.sec = 'clean';
    return `<div class="segs" role="group" aria-label="우리 반 메뉴">${secs.map(([k, label]) =>
        `<button type="button" class="${S.sec === k ? 'on' : ''}" data-action="setSec" data-v="${k}" aria-pressed="${S.sec === k}">${label}</button>`).join('')}</div>
    ${SEC_VIEW[S.sec]()}`;
}

const VIEWS = {
    today: { render: todayView },
    timetable: { render: ttView },
    schedule: { render: scheduleView },
    us: { render: usView },
    meal: { render: mealView, mounted: mealMounted }   // 급식은 오늘 탭의 점심 칸에서 들어가요
};

function route() {
    const h = decodeURIComponent(location.hash.slice(1)) || 'today';
    const a = ALIAS[h];
    if (a) {
        S.tab = a[0];
        if (a[0] === 'schedule') S.filter = a[1]; else S.sec = a[1];
        history.replaceState(null, '', '#' + a[0]);
    } else {
        S.tab = h;
    }
}
route();

// ----- 화면 그리기 -----
let lastTab = null;
let mealPrefetched = false;

const meHtml = () => `<span class="me-ic">${icon('user')}</span><span class="me-name">${esc(S.me.name)}</span><i class="badge">${esc(RN[S.me.role] || '')}</i>`;

const tabsHtml = () => {
    const cur = S.tab === 'meal' ? 'today' : S.tab;
    return TABS.map(([k, ic, label]) =>
        `<a href="#${k}" class="tab${cur === k ? ' on' : ''}"${cur === k ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('');
};

function render() {
    const root = document.documentElement;
    if (!S.authReady) return;
    if (!S.user) { root.dataset.view = 'login'; return; }
    if (!S.me || !S.cleaning || !S.timetable) { root.dataset.view = 'boot'; return; }
    root.dataset.view = 'app';

    if (!VIEWS[S.tab]) {
        S.tab = 'today';
        history.replaceState(null, '', '#today');
    }
    patch($('#top-me'), meHtml());
    patch($('#tabbar'), tabsHtml());

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
    refreshMe();

    // 첫 화면이 뜬 뒤 한가할 때 오늘 급식을 미리 받아 둡니다. (오늘 탭 점심 칸에 쓰여요)
    if (!mealPrefetched) {
        mealPrefetched = true;
        const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1200));
        idle(prefetchToday);
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
        notices: [], noticeErr: false, banners: []
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
        <div class="panel-head"><h2>비밀번호 변경</h2><button type="button" class="ghost" data-action="closeDialog" data-id="pw-dlg">닫기 ✕</button></div>
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

// ----- 버튼·폼 동작 연결 (이벤트 위임) -----
// HTML에는 data-action="이름"만 적고, 실제 함수는 여기서 찾아 실행합니다.
// 사용자 데이터가 JS 코드 속에 들어가지 않으므로 XSS를 막을 수 있어요.
const ACTIONS = {
    ...todayActions, ...noticeActions, ...calActions, ...cleaningActions, ...ttActions,
    ...mealActions, ...sgActions, ...bannerActions, ...dutyActions, ...adminActions,
    ...themeActions, ...meActions,
    login, openPassword, changePassword,
    logout: () => signOut(auth),
    closeDialog: el => closeDialog(el.dataset.id),
    setSec: el => { S.sec = el.dataset.v; requestRender(); },
    setFilter: el => { S.filter = el.dataset.v; requestRender(); }
};

document.addEventListener('click', e => {
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

window.addEventListener('hashchange', () => {
    route();
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

// 오늘 탭의 '지금 수업' 표시를 30초마다 새로 계산합니다. (바뀐 게 없으면 화면은 그대로예요)
setInterval(() => {
    if (S.tab === 'today' && S.me && !document.hidden) requestRender();
}, 30000);

// ----- 시작 -----
applyUI();
const loginBtn = $('#login-btn');
loginBtn.disabled = false;
loginBtn.textContent = '로그인';
