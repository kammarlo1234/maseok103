// <dialog>를 쓰면 Esc로 닫기, 포커스 가두기, 배경 클릭 막기가 기본으로 됩니다.
const open = new Map();

export function openDialog(id, html, { onClose, bare = false } = {}) {
    if (open.has(id)) return open.get(id);
    const d = document.createElement('dialog');
    d.id = id;
    d.className = bare ? 'dlg dlg-bare' : 'dlg';
    d.innerHTML = html;
    // 바깥(어두운 배경)을 누르면 닫기. bare(사진 크게 보기)는 어디를 눌러도 닫기.
    d.addEventListener('click', e => {
        if (bare || e.target === d) d.close();
    });
    d.addEventListener('close', () => {
        open.delete(id);
        d.remove();
        onClose?.();
    });
    document.body.append(d);
    open.set(id, d);
    d.showModal();
    return d;
}

export const closeDialog = id => open.get(id)?.close();
export const closeAllDialogs = () => [...open.values()].forEach(d => d.close());
export const isOpen = id => open.has(id);
