// A game of ten multiple-choice questions with personal records, a result screen and confetti.
// The page provides #home with a .hero holding #startBtn, then calls quiz() with what differs per game.
// Needs shared/results.js loaded first.
// Classic script on purpose: ES modules don't load from file://.
const QUESTIONS = 10;
const POINTS = 10;
const TOP = 10;
const AUTO_NEXT_MS = 1800;

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};

const shuffle = a => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const PLAYER = (() => { try { return localStorage.getItem('player'); } catch {} })();
if (!PLAYER) location.replace('../index.html');

/**
 * id: localStorage prefix for records and stats.
 * label, keys: text above the question and the keyboard hint (HTML); label may be a function of the item.
 * deal(): QUESTIONS fresh items, or a promise of them. question(item): nodes of the question card.
 * The answers are either
 *   options(item): answer buttons in display order, [{ label, cls, ok }]; keys 1–9 pick them, or
 *   play(item, settle): nodes the game runs itself until it calls settle(ok, picked, points) once.
 *   points defaults to POINTS when ok and 0 otherwise; a partly right answer is not ok and goes to the mistakes.
 * reveal(item, ok): optional, updates the question once answered.
 * hint(item, picked), mistake(item, picked): nodes explaining the answer, in the hint and in the mistakes list.
 *   picked is the chosen option, or whatever play() passed to settle().
 * summary(answers, score): optional, nodes of an extra card on the result screen, called once per finished game.
 *   answers are [{ item, ok, picked, points }] in the order of the questions.
 * timed: optional, shows a stopwatch that runs while a question waits for its answer; records keep the time
 *   and equal scores rank by it, faster first.
 * autoNext: optional, ms before moving on after a right answer, AUTO_NEXT_MS by default.
 */
function quiz(def) {
  const RECORDS_KEY = recordsKey(def.id);
  const STATS_KEY = `${def.id}-stats-v2`;

  $('home').querySelector('.hero').insertAdjacentHTML('afterend', `
    <div class="stats" id="stats" hidden>
      <div class="stat"><span class="stat-value" id="statBest"></span><span class="stat-label">🏆 рекорд</span></div>
      <div class="stat"><span class="stat-value" id="statGames"></span><span class="stat-label">🎮 игр сыграно</span></div>
      <div class="stat"><span class="stat-value" id="statAvg"></span><span class="stat-label">📈 в среднем</span></div>
    </div>
    <div class="card">
      <h2>🏆 Мои рекорды</h2>
      <div id="homeBoard"></div>
      <div class="board-foot" id="resetWrap" hidden>
        <button class="link-btn" id="resetBtn">Начать с чистого листа</button>
      </div>
    </div>`);

  $('home').insertAdjacentHTML('afterend', `
    <section id="game" class="screen">
      <div class="topbar">
        <button class="btn ghost small" id="exitBtn" aria-label="На главную">← <span class="wide">На главную</span><span class="narrow">🏠</span></button>
        <span class="counter"><span class="wide">Вопрос </span><span id="counter"></span></span>
        <span class="stars" id="stars">⭐ 0</span>
      </div>
      <div class="progress"><div id="bar"></div></div>
      ${def.timed ? '<div class="clock" id="clock"><span class="clock-icon">⏱</span><span id="clockTime"></span></div>' : ''}

      <div class="card question" id="questionCard">
        <div class="q-label" id="qLabel"></div>
        <div id="question"></div>
      </div>

      <div class="feedback" id="feedback" aria-live="polite"></div>

      <div class="answers" id="answers"></div>

      <div class="next-area">
        <button class="btn pink big next" id="nextBtn"><span id="nextLabel">Дальше →</span></button>
      </div>
      <div class="keys">${def.keys}</div>
    </section>

    <section id="result" class="screen">
      <div class="card result-head">
        <div class="result-emoji" id="resEmoji"></div>
        <div class="result-score"><span id="resScore">0</span><small>/100</small></div>
        ${def.timed ? '<div class="result-time" id="resTime"></div>' : ''}
        <p class="result-msg" id="resMsg"></p>
        <p class="result-note" id="resNote"></p>
      </div>

      <div class="card" id="summaryCard" hidden></div>

      <div class="card" id="mistakesCard" hidden>
        <h2>📝 Работа над ошибками</h2>
        <ul class="mistakes" id="mistakesList"></ul>
      </div>

      <div class="card">
        <h2>🏆 Мои рекорды</h2>
        <div id="resultBoard"></div>
      </div>

      <div class="row" style="margin-top:20px">
        <button class="btn pink big" id="againBtn">🔁 Ещё раз</button>
        <button class="btn ghost big" id="homeBtn">🏠 На главную</button>
      </div>
    </section>`);

  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="dlg">
      <form method="dialog">
        <h3 id="dlgTitle"></h3>
        <p id="dlgText"></p>
        <div class="row">
          <button class="btn ghost" value="cancel">Остаться</button>
          <button class="btn danger" value="ok" id="dlgOk"></button>
        </div>
      </form>
    </dialog>`);

  // Equal scores: the faster one is higher in a timed game; otherwise the fresher one, pushing the older one out of the top.
  const byRank = (a, b) => b.score - a.score || (a.ms ?? 0) - (b.ms ?? 0) || b.at - a.at;
  const sortRecords = records => records
    .filter(r => r && typeof r.score === 'number')
    .sort(byRank)
    .slice(0, TOP);

  const loadRecords = () => sortRecords(store.get(RECORDS_KEY, []));
  const loadStats = () => store.get(STATS_KEY, { games: 0, total: 0 });

  function saveResult(record) {
    const records = sortRecords([...loadRecords(), record]);
    const stats = loadStats();
    store.set(RECORDS_KEY, records);
    store.set(STATS_KEY, { games: stats.games + 1, total: stats.total + record.score });
    return records;
  }

  function formatWhen(at) {
    const d = new Date(at);
    const today = new Date().setHours(0, 0, 0, 0);
    const days = Math.round((today - new Date(at).setHours(0, 0, 0, 0)) / 864e5);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    const day = days === 0 ? 'сегодня' : days === 1 ? 'вчера'
      : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
    return [day, d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })];
  }

  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    window.scrollTo(0, 0);
  }

  // ---------- Scoreboard ----------
  function renderBoard(container, highlightAt) {
    const records = loadRecords();
    container.replaceChildren();

    if (!records.length) {
      const blank = el('div', 'blank');
      blank.append(el('div', 'emoji', '🏆'), el('strong', null, `${PLAYER}, здесь будут твои рекорды`), el('p', null, 'Сыграй первую игру — и результат появится здесь!'));
      container.append(blank);
      return;
    }

    const table = el('table', 'board');
    const head = el('tr');
    ['#', 'Баллы', ...def.timed ? ['Время'] : [], 'Когда'].forEach(t => head.append(el('th', null, t)));
    table.append(head);

    const medals = ['🥇', '🥈', '🥉'];
    records.forEach((r, i) => {
      const tr = el('tr', r.at === highlightAt ? 'me' : '');
      const [day, time] = formatWhen(r.at);
      const when = el('td', 'when', day);
      when.append(el('small', null, time));
      tr.append(el('td', null, medals[i] || i + 1), el('td', 'pts', r.score));
      if (def.timed) tr.append(el('td', 'time', r.ms == null ? '—' : formatTime(r.ms)));
      tr.append(when);
      table.append(tr);
    });
    container.append(table);
  }

  function goHome() {
    stopTimer();
    game = null;
    const records = loadRecords();
    const stats = loadStats();
    $('stats').hidden = $('resetWrap').hidden = !stats.games;
    if (stats.games) {
      $('statBest').textContent = records[0]?.score ?? 0;
      if (records[0]?.ms != null) $('statBest').append(el('small', null, formatTime(records[0].ms)));
      $('statGames').textContent = stats.games;
      $('statAvg').textContent = Math.round(stats.total / stats.games);
    }
    renderBoard($('homeBoard'));
    show('home');
  }

  // ---------- Dialog ----------
  function ask(title, text, okLabel) {
    const dlg = $('dlg');
    $('dlgTitle').textContent = title;
    $('dlgText').textContent = text;
    $('dlgOk').textContent = okLabel;
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise(resolve => dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true }));
  }

  // ---------- Game ----------
  let game = null;

  function stopTimer() {
    if (game) clearTimeout(game.timer);
    $('nextBtn').classList.remove('auto');
  }

  // ---------- Stopwatch ----------
  // game.ms is the time of the answered questions; game.since is when the current one appeared, null while it waits for Next.
  const elapsed = () => game.ms + (game.since == null ? 0 : performance.now() - game.since);

  function runClock() {
    if (!def.timed) return;
    game.since = performance.now();
    $('clock').classList.add('running');
    const tick = () => {
      if (!game || game.since == null) return;
      $('clockTime').textContent = formatTime(elapsed());
      requestAnimationFrame(tick);
    };
    tick();
  }

  function pauseClock() {
    if (!def.timed || game.since == null) return;
    game.ms = elapsed();
    game.since = null;
    $('clock').classList.remove('running');
    $('clockTime').textContent = formatTime(game.ms);
  }

  let dealing = false;

  async function startGame() {
    if (dealing) return;
    stopTimer();
    dealing = true;
    let items;
    try {
      items = await def.deal();
    } catch (e) {
      console.error(e);
      alert('Не получилось начать игру. Проверь интернет и попробуй ещё раз.');
      return;
    } finally {
      dealing = false;
    }
    game = { items, index: 0, score: 0, mistakes: [], answers: [], answered: false, timer: null, ms: 0, since: null };
    show('game');
    renderQuestion();
  }

  function renderQuestion() {
    const item = game.items[game.index];
    game.answered = false;
    game.options = def.options?.(item);

    $('counter').textContent = `${game.index + 1} / ${QUESTIONS}`;
    $('stars').textContent = `⭐ ${game.score}`;
    $('bar').style.width = `${game.index / QUESTIONS * 100}%`;
    $('qLabel').innerHTML = typeof def.label === 'function' ? def.label(item) : def.label;
    $('question').replaceChildren(...def.question(item));

    const card = $('questionCard');
    card.classList.remove('shake');
    card.style.animation = 'none';
    card.offsetWidth;
    card.style.animation = 'fadeIn .3s ease';

    $('answers').replaceChildren(...game.options ? game.options.map((option, i) => {
      const btn = el('button', `ans ${option.cls ?? ''}`);
      btn.append(...[option.label].flat());
      btn.onclick = () => answer(i);
      return btn;
    }) : def.play(item, settle));
    $('feedback').replaceChildren();
    $('nextBtn').classList.remove('visible', 'auto');
    runClock();
  }

  function answer(i) {
    if (!game || game.answered) return;
    const ok = game.options[i].ok;
    [...$('answers').children].forEach((btn, j) => {
      btn.disabled = true;
      if (game.options[j].ok) btn.classList.add('right');
      if (j === i && !ok) btn.classList.add('wrong');
    });
    settle(ok, game.options[i]);
  }

  function settle(ok, picked, points = ok ? POINTS : 0) {
    if (!game || game.answered) return;
    game.answered = true;
    pauseClock();

    const item = game.items[game.index];
    game.score += points;
    game.answers.push({ item, ok, picked, points });
    if (!ok) game.mistakes.push([item, picked]);
    def.reveal?.(item, ok);

    const hint = el('div', `hint ${ok ? 'ok' : 'bad'}`);
    const verdict = ok ? '✅ Верно!' : points ? `🟡 +${points} из ${POINTS}` : '❌ Ошибка!';
    hint.append(el('span', 'verdict', verdict), ...def.hint(item, picked));
    $('feedback').replaceChildren(hint);

    const stars = $('stars');
    stars.textContent = `⭐ ${game.score}`;
    if (points) { stars.classList.remove('bump'); stars.offsetWidth; stars.classList.add('bump'); }
    else $('questionCard').classList.add('shake');
    $('bar').style.width = `${(game.index + 1) / QUESTIONS * 100}%`;

    // A mistake waits for the button so there is time to read the hint.
    const next = $('nextBtn');
    $('nextLabel').textContent = game.index === QUESTIONS - 1 ? 'Результаты →' : 'Дальше →';
    next.classList.add('visible');
    if (ok) {
      const wait = def.autoNext ?? AUTO_NEXT_MS;
      next.style.setProperty('--auto', `${wait}ms`);
      next.classList.add('auto');
      game.timer = setTimeout(nextQuestion, wait);
    } else {
      next.focus({ preventScroll: true });
    }
  }

  function nextQuestion() {
    if (!game || !game.answered) return;
    stopTimer();
    game.index++;
    game.index >= QUESTIONS ? finish() : renderQuestion();
  }

  async function exitGame() {
    if (!game) return goHome();
    const started = game.index > 0 || game.answered;
    if (!started) return goHome();

    const wasAuto = game.answered && $('nextBtn').classList.contains('auto');
    stopTimer();
    if (await ask('Выйти на главную?', 'Эта игра не засчитается.', 'Выйти')) goHome();
    else if (wasAuto) nextQuestion();
  }

  // ---------- Result ----------
  function finish() {
    const { score, mistakes, answers, ms } = game;
    game = null;

    const summary = def.summary?.(answers, score);
    $('summaryCard').hidden = !summary;
    $('summaryCard').replaceChildren(...summary ?? []);

    const prev = loadRecords()[0];
    const prevBest = prev?.score;
    const at = Date.now();
    const record = def.timed ? { score, at, ms: Math.round(ms) } : { score, at };
    const rank = saveResult(record).findIndex(r => r.at === at);

    const { emoji, msg } = resultFor(score);
    $('resEmoji').textContent = emoji;
    $('resMsg').textContent = `${PLAYER}, ${msg}`;
    countUp($('resScore'), score);
    if (def.timed) $('resTime').textContent = `⏱ ${formatTime(record.ms)}`;

    // In a timed game a tie in score is decided by time, so it is either a new record or a slower try.
    const timedTie = def.timed && score === prevBest && prev.ms != null;
    const note = $('resNote');
    const best = prevBest == null || score > prevBest || (score === prevBest && rank === 0);
    note.className = `result-note${best ? ' best' : ''}`;
    note.textContent =
      prevBest == null ? '🎉 Первый рекорд поставлен!'
      : score > prevBest ? `🎉 Новый личный рекорд! Было ${prevBest}.`
      : timedTie && rank === 0 ? `🎉 Новый рекорд скорости! Быстрее на ${formatTime(prev.ms - record.ms)}.`
      : timedTie ? `${rank >= 0 ? `📌 ${rank + 1}-е место в твоих рекордах. ` : ''}До рекорда ${formatTime(record.ms - prev.ms)}.`
      : score === prevBest ? '⭐ Рекорд повторён!'
      : rank >= 0 ? `📌 ${rank + 1}-е место в твоих рекордах. До рекорда ${prevBest - score} баллов.`
      : `До рекорда не хватило ${prevBest - score} баллов.`;

    $('mistakesCard').hidden = !mistakes.length;
    $('mistakesList').replaceChildren(...mistakes.map(([item, picked]) => {
      const li = el('li');
      li.append(...def.mistake(item, picked));
      return li;
    }));

    renderBoard($('resultBoard'), at);
    show('result');
    if (score >= 80) confetti();
  }

  function countUp(node, target) {
    const start = performance.now();
    const step = now => {
      const t = Math.min((now - start) / 900, 1);
      node.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    };
    node.textContent = 0;
    requestAnimationFrame(step);
  }

  function confetti() {
    const box = el('div', 'confetti');
    const colors = ['#22e3ff', '#ff3ea5', '#5dff8f', '#ffd23f', '#9b5cff'];
    for (let i = 0; i < 90; i++) {
      const p = el('i');
      p.style.left = `${Math.random() * 100}vw`;
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = `${2 + Math.random() * 2}s`;
      p.style.animationDelay = `${Math.random() * .8}s`;
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      box.append(p);
    }
    document.body.append(box);
    setTimeout(() => box.remove(), 5000);
  }

  // ---------- Wiring ----------
  $('startBtn').onclick = startGame;
  $('againBtn').onclick = startGame;
  $('homeBtn').onclick = goHome;
  $('exitBtn').onclick = exitGame;
  $('nextBtn').onclick = nextQuestion;
  $('resetBtn').onclick = async () => {
    if (await ask('Начать с чистого листа?', 'Все рекорды и статистика удалятся навсегда.', 'Удалить')) {
      store.set(RECORDS_KEY, []);
      store.set(STATS_KEY, { games: 0, total: 0 });
      goHome();
    }
  };

  document.addEventListener('keydown', e => {
    if ($('dlg').open || !game || !$('game').classList.contains('active')) return;
    if (game.options && e.key >= '1' && e.key <= String(game.options.length)) answer(+e.key - 1);
    else if (game.options && e.key === 'ArrowLeft') answer(0);
    else if (game.options && e.key === 'ArrowRight') answer(1);
    else if ((e.key === 'Enter' || e.key === ' ') && game.answered) { e.preventDefault(); nextQuestion(); }
    else if (e.key === 'Escape') exitGame();
  });

  document.querySelectorAll('[data-player]').forEach(n => n.textContent = PLAYER);
  goHome();
}
