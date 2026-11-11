// 내 정보 시트: 이름·역할, 배너, 화면 설정(테마·효과·나만의 배경과 글꼴), 비밀번호, 로그아웃
import { S, RN } from '../store.js';
import { $, esc, patch } from '../utils.js';
import { openDialog, isOpen } from '../dialog.js';
import { bannersVisible } from './banners.js';
import { PALETTE, FONTS, ui, look } from '../theme.js';

const nameOfColor = hex => PALETTE.find(p => p.hex === hex)?.name || '';

const swatches = (k, cur, label, withAuto) => `<div class="sw-row" role="group" aria-label="${label}">
    ${withAuto ? `<button type="button" class="sw sw-auto${cur ? '' : ' on'}" data-action="setLook" data-k="${k}" data-v="auto" data-key="look-${k}-auto" aria-pressed="${!cur}">자동</button>` : ''}
    ${PALETTE.map(p => `<button type="button" class="sw${cur === p.id ? ' on' : ''}" style="--c:${p.hex}" data-action="setLook" data-k="${k}" data-v="${p.id}" data-key="look-${k}-${p.id}" aria-label="${p.name}" title="${p.name}" aria-pressed="${cur === p.id}"></button>`).join('')}
</div>`;

const seg = (items, isOn, attrs) => `<div class="seg">${items.map(([v, label, font]) =>
    `<button type="button" class="${isOn(v) ? 'on' : ''}" ${attrs(v)} aria-pressed="${isOn(v)}"${font ? ` style="font-family:${font}"` : ''}>${label}</button>`).join('')}</div>`;

function lookHtml() {
    const L = look();
    const bg = ui.bg || { m: 'grad', a: 'teal', b: 'mint' };
    const solid = bg.m === 'solid';
    return `<h3>나만의 배경과 글꼴</h3>
        <div class="look-preview" style="background:linear-gradient(135deg,${L.a},${L.b});color:${L.ink}">
            <b>2026 마석고등학교 1-3</b><span>지금 3교시 수학, 12분 남음</span>
        </div>
        ${L.inkWarn ? '<p class="m" role="status">고른 글자색이 배경과 너무 비슷해서, 읽기 편한 색으로 보여 주고 있어요.</p>' : ''}
        <p class="look-label">배경 방식</p>
        ${seg([['grad', '그라데이션'], ['solid', '단색']], v => (L.custom ? (solid ? 'solid' : 'grad') : '') === v, v => `data-action="setLook" data-k="m" data-v="${v}" data-key="look-m-${v}"`)}
        <p class="look-label">${solid ? '배경색' : '시작 색'}${L.custom ? ` (${esc(nameOfColor(L.a))})` : ''}</p>
        ${swatches('a', L.custom ? bg.a : '', '배경 시작 색', false)}
        ${solid ? '' : `<p class="look-label">끝 색${L.custom ? ` (${esc(nameOfColor(L.b))})` : ''}</p>${swatches('b', L.custom ? bg.b : '', '배경 끝 색', false)}`}
        <p class="look-label">글자색 <span class="m">(배경 위에 바로 놓인 글자)</span></p>
        ${swatches('ink', ui.ink || '', '글자색', true)}
        <p class="look-label">글꼴</p>
        ${seg(FONTS, v => L.font === v, v => `data-action="setLook" data-k="font" data-v="${v}" data-key="look-font-${v}"`)}
        <button type="button" class="ghost mt" data-action="resetLook">기본 모양으로 되돌리기</button>`;
}

const bodyHtml = () => `<section class="sheet-sec">
        <h3>화면 설정</h3>
        ${seg([['system', '시스템'], ['light', '라이트'], ['dark', '다크']], v => (ui.t || 'system') === v, v => `data-action="setTheme" data-t="${v}" data-key="theme-${v}"`)}
        <label class="todo"><input type="checkbox" data-change="setFx" data-key="fx-toggle" ${ui.fx !== false ? 'checked' : ''}><span>화려한 효과 (배경이 천천히 번져요)</span></label>
    </section>
    <section class="sheet-sec">${lookHtml()}</section>
    <section class="sheet-sec">
        <h3>계정</h3>
        <div class="row">
            <button type="button" class="ghost" data-action="toggleBanners" aria-pressed="${bannersVisible()}">${bannersVisible() ? '특별 배너 켜짐' : '특별 배너 꺼짐'}</button>
            <button type="button" class="ghost" data-action="openPassword">비밀번호 변경</button>
            <button type="button" class="ghost danger" data-action="logout">로그아웃</button>
        </div>
    </section>`;

export function openMe() {
    openDialog('me-dlg', `<div class="panel">
        <div class="panel-head"><div><h2>${esc(S.me.name)}</h2><p class="m">${esc(RN[S.me.role] || '')}</p></div><button type="button" class="ghost" data-action="closeDialog" data-id="me-dlg">닫기</button></div>
        <div id="me-body"></div>
    </div>`);
    refreshMe();
}

export function refreshMe() {
    if (isOpen('me-dlg')) patch($('#me-body'), bodyHtml());
}

export const actions = { openMe };
