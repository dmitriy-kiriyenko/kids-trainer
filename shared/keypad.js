// A phone keypad for games answered by typing digits in play(): 1–9, then ⌫ and 0, with the keyboard's digits working too.
// Needs shared/quiz.js loaded first.
// Classic script on purpose: ES modules don't load from file://.
const BACK = '⌫';

// The keypad of the question on screen, null once its answer is checked.
let activeKeypad = null;

/**
 * onKey(key) gets '0'–'9', or BACK when back is true; without back there is no ⌫ key and Backspace does nothing.
 * Returns { node } for play() to show, press(key) and disable(), which greys the keys out and stops taking them.
 */
function keypad(onKey, { back = false } = {}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ...back ? [BACK] : [], '0'];
  const buttons = new Map(keys.map(key => {
    const btn = el('button', `ans key${key === BACK ? ' back' : key === '0' ? ' zero' : ''}`, key);
    btn.setAttribute('aria-label', key === BACK ? 'Стереть' : key);
    // Keep the focus off the keys, or Enter on the keyboard would press the last tapped one again.
    btn.tabIndex = -1;
    btn.onmousedown = e => e.preventDefault();
    btn.onclick = () => pad.press(key);
    return [key, btn];
  }));

  const node = el('div', 'keypad');
  node.append(...buttons.values());

  const pad = {
    node,
    press(key) {
      if (activeKeypad !== pad || !buttons.has(key)) return;
      const btn = buttons.get(key);
      btn.classList.remove('press'); btn.offsetWidth; btn.classList.add('press');
      setTimeout(() => btn.classList.remove('press'), 120);
      onKey(key);
    },
    disable() {
      if (activeKeypad === pad) activeKeypad = null;
      buttons.forEach(btn => btn.disabled = true);
    },
  };
  activeKeypad = pad;
  return pad;
}

document.addEventListener('keydown', e => {
  if (!activeKeypad || $('dlg').open || !$('game').classList.contains('active')) return;
  if (e.key >= '0' && e.key <= '9') activeKeypad.press(e.key);
  else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); activeKeypad.press(BACK); }
});
