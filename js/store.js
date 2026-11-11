// 앱 전체가 함께 보는 상태와, 화면을 다시 그리는 예약 장치
import { today } from './utils.js';

export const LV = { dev: 4, teacher: 3, pres: 2, vice: 2, student: 1 };
export const RN = { dev: '개발자', teacher: '선생님', pres: '반장', vice: '부반장', student: '학생' };

const now = new Date();

export const S = {
    authReady: false,
    user: null,      // Firebase 로그인 사용자
    me: null,        // users 컬렉션의 내 프로필
    users: [],
    events: [],
    roles: [],
    todos: [],
    cleaning: null,
    timetable: null,
    notices: [],
    noticeErr: false,
    banners: [],
    suggestions: [],
    sgErr: false,
    tab: 'today',
    menuOpen: false,
    sec: 'clean',      // 우리 반 탭의 하위 구역
    filter: 'all',     // 일정 탭의 종류 필터
    calY: now.getFullYear(),
    calM: now.getMonth(),
    sel: today()
};

export const lv = () => LV[S.me?.role] || 0;
export const isLeader = () => lv() >= 2;   // 반장·부반장 이상
export const isStaff = () => lv() >= 3;    // 선생님·개발자
export const nameOf = id => S.users.find(u => u.id == id)?.name || '미배정';
export const students = () => S.users.filter(u => (LV[u.role] || 0) < 3);

// 데이터가 여러 개 한꺼번에 도착해도 한 프레임에 한 번만 그립니다.
let renderer = null;
let queued = false;
export const onRender = fn => { renderer = fn; };
export function requestRender() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
        queued = false;
        renderer?.();
    });
}
export function renderNow() {
    queued = false;
    renderer?.();
}
