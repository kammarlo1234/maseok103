// 메뉴·버튼용 아이콘 (인라인 SVG: 기기마다 모양이 달라지는 이모지 대신 씁니다)
const PATHS = {
    home: '<path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.5.3 4.2 2 4.5 5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.7-4 4-6 8-6s7.3 2 8 6"/>',
    mega: '<path d="M4 10v4h3l7 4V6l-7 4z"/><path d="M18 9c1.3 1 1.3 5 0 6"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    food: '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 3c-2 2-3 5-3 8h3v10"/>',
    broom: '<path d="M14 3l-3 7"/><path d="M8 10h8l1.5 4H6.5z"/><path d="M8 14l-1 7M12 14v7M16 14l1 7"/>'
};
export const icon = (name, cls = '') =>
    `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
