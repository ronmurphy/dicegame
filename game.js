'use strict';

// ============================================================
//  CONSTANTS
// ============================================================

const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100];

const DIE_COLOR = {
  4:   '#ff6b6b',
  6:   '#ff9f43',
  8:   '#feca57',
  10:  '#48dbfb',
  12:  '#1dd1a1',
  20:  '#a29bfe',
  100: '#fd79a8',
};

const AI_NAMES = ['Aria', 'Bram', 'Cleo', 'Dax', 'Ember', 'Finn', 'Gwen'];

const DIFFICULTY = {
  easy:   { label: 'Easy',   targetD100s: 1 },
  medium: { label: 'Medium', targetD100s: 3 },
  hard:   { label: 'Hard',   targetD100s: 5 },
};

// ============================================================
//  PLAYER CLASS
// ============================================================

class Player {
  constructor(name, isHuman) {
    this.name = name;
    this.isHuman = isHuman;
    this.dice = [4];           // array of die face counts
    this.madeFirstChoice = false; // once true, D4 protection is gone
    this.eliminated = false;
    this.chosenDie = 4;        // die selected for current round
    this.roundScore = 0;
    this.roundRolls = [];
  }

  // Starting D4 is protected until first choice is made
  get isProtected() { return !this.madeFirstChoice; }

  get d100Count() { return this.dice.filter(d => d === 100).length; }

  get bestDie() {
    return this.dice.length > 0 ? Math.max(...this.dice) : 0;
  }

  rollForRound() {
    const sides = this.chosenDie;
    this.roundRolls = [];
    this.roundScore = 0;
    for (let i = 0; i < sides; i++) {
      const roll = Math.ceil(Math.random() * sides);
      this.roundRolls.push(roll);
      this.roundScore += roll;
    }
  }

  applyChoice(choice) {
    const prevDie = this.chosenDie;
    this.madeFirstChoice = true;

    if (choice === 'duplicate') {
      this.dice.push(this.chosenDie);
    } else {
      // upgrade – replace chosen die with next tier
      const idx = DICE_SIDES.indexOf(this.chosenDie);
      const nextIdx = Math.min(idx + 1, DICE_SIDES.length - 1);
      const dieIdx = this.dice.indexOf(this.chosenDie);
      if (dieIdx !== -1) {
        this.dice[dieIdx] = DICE_SIDES[nextIdx];
      }
    }
    this.dice.sort((a, b) => b - a);
    return prevDie;
  }

  // Returns the die value lost (or null if nothing can be lost)
  loseRandomDie() {
    if (this.dice.length === 0) return null;

    let eligible = this.dice.map((_, i) => i);

    // Protected players can never lose their lone starting D4
    if (this.isProtected) {
      const d4Idx = this.dice.indexOf(4);
      if (d4Idx !== -1) {
        if (this.dice.length === 1) return null; // only the protected D4 – safe
        eligible = eligible.filter(i => i !== d4Idx);
      }
      if (eligible.length === 0) return null;
    }

    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    const lost = this.dice[pick];
    this.dice.splice(pick, 1);
    return lost;
  }

  // AI strategy: upgrade when possible (fastest path to D100), else duplicate
  getAIChoice() {
    const idx = DICE_SIDES.indexOf(this.chosenDie);
    return idx < DICE_SIDES.length - 1 ? 'upgrade' : 'duplicate';
  }
}

// ============================================================
//  GAME STATE
// ============================================================

const state = {
  players:    [],
  pool:       [],
  round:      0,
  difficulty: 'easy',
  numOpponents: 2,
  phase:      'setup',  // setup | select-die | rolling | choice | continue | over
};

// ============================================================
//  UTILITY
// ============================================================

function dieName(sides) { return `D${sides}`; }

function dieChipHTML(sides, extra = '') {
  return `<div class="die-chip ${extra}" style="background:${DIE_COLOR[sides]}" title="${dieName(sides)}">${dieName(sides)}</div>`;
}

function poolDieHTML(sides) {
  return `<div class="pool-die" style="background:${DIE_COLOR[sides]}" title="${dieName(sides)}">${dieName(sides)}</div>`;
}

// ============================================================
//  LOGGING
// ============================================================

function addLog(msg, type = '') {
  const el = document.createElement('div');
  el.className = `log-entry ${type ? 'log-' + type : ''}`;
  el.textContent = msg;
  const log = document.getElementById('log-entries');
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

// ============================================================
//  SCREEN MANAGEMENT
// ============================================================

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showSection(id) {
  document.getElementById(id).classList.remove('hidden');
}

function hideSection(id) {
  document.getElementById(id).classList.add('hidden');
}

// ============================================================
//  SETUP SCREEN INTERACTIONS
// ============================================================

document.querySelectorAll('#difficulty-group .opt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#difficulty-group .opt-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

document.querySelectorAll('#opponents-group .opt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#opponents-group .opt-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

document.getElementById('start-btn').addEventListener('click', initGame);
document.getElementById('play-again-btn').addEventListener('click', () => showScreen('setup-screen'));

// ============================================================
//  GAME INITIALIZATION
// ============================================================

function initGame() {
  state.difficulty    = document.querySelector('#difficulty-group .opt-btn.active').dataset.value;
  state.numOpponents  = parseInt(document.querySelector('#opponents-group .opt-btn.active').dataset.value, 10);
  state.pool          = [];
  state.round         = 0;
  state.phase         = 'select-die';

  // Build players
  state.players = [];
  state.players.push(new Player('You', true));
  const names = [...AI_NAMES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < state.numOpponents; i++) {
    state.players.push(new Player(names[i], false));
  }

  // Clear log
  document.getElementById('log-entries').innerHTML = '';

  // Header info
  const cfg = DIFFICULTY[state.difficulty];
  document.getElementById('difficulty-badge').textContent = cfg.label;
  document.getElementById('target-display').textContent =
    `Goal: ${cfg.targetD100s}× D100`;

  showScreen('game-screen');
  startRound();
}

// ============================================================
//  ROUND LIFECYCLE
// ============================================================

function startRound() {
  state.round++;
  state.phase = 'select-die';

  document.getElementById('round-display').textContent = `Round ${state.round}`;

  // Hide all action sections
  ['die-selector','roll-section','results-section','choice-section','continue-section'].forEach(hideSection);

  // AI players auto-select best die
  state.players.forEach(p => {
    if (!p.isHuman && !p.eliminated) {
      p.chosenDie = p.bestDie;
    }
  });

  addLog(`── Round ${state.round} ──`, 'round');
  renderPlayers();

  const human = state.players[0];
  if (human.eliminated) {
    // Human already out (shouldn't reach new rounds, but safety)
    showRollSection();
    return;
  }

  if (human.dice.length > 1) {
    showDieSelector();
  } else {
    human.chosenDie = human.dice[0];
    showRollSection();
  }
}

// ---- Die selector ----

function showDieSelector() {
  const human = state.players[0];
  const container = document.getElementById('die-options');
  container.innerHTML = '';

  human.dice.forEach(sides => {
    const btn = document.createElement('button');
    btn.className = 'die-opt-btn';
    btn.style.background = DIE_COLOR[sides];
    btn.textContent = dieName(sides);
    btn.title = `${sides} sides – roll it ${sides} times`;
    btn.addEventListener('click', () => {
      human.chosenDie = sides;
      hideSection('die-selector');
      showRollSection();
      renderPlayers(); // highlight chosen die
    });
    container.appendChild(btn);
  });

  showSection('die-selector');
}

// ---- Roll section ----

function showRollSection() {
  const human = state.players[0];
  if (!human.eliminated) {
    document.getElementById('roll-hint').textContent =
      `You're rolling a ${dieName(human.chosenDie)} — ${human.chosenDie} times`;
  }
  showSection('roll-section');
}

document.getElementById('roll-btn').addEventListener('click', executeRound);

// ---- Execute round ----

function executeRound() {
  hideSection('roll-section');
  state.phase = 'rolling';

  const active = state.players.filter(p => !p.eliminated);
  active.forEach(p => p.rollForRound());

  renderPlayers(true); // show rolling animation briefly

  setTimeout(() => {
    resolveRound(active);
  }, 600);
}

function resolveRound(active) {
  // Find max score
  let maxScore = -1;
  active.forEach(p => { if (p.roundScore > maxScore) maxScore = p.roundScore; });

  // Tied players — pick winner by random tiebreak
  const tied = active.filter(p => p.roundScore === maxScore);
  const winner = tied[Math.floor(Math.random() * tied.length)];

  state.phase = 'resolving';

  // Show results
  showResults(active, winner);

  addLog(`${winner.name} wins the round with ${maxScore}!`, 'win');

  // Losers lose a die
  const losers = active.filter(p => p !== winner);
  const losses = [];
  losers.forEach(p => {
    const lost = p.loseRandomDie();
    if (lost !== null) {
      state.pool.push(lost);
      losses.push(`${p.name} lost ${dieName(lost)}`);
      addLog(`${p.name} lost a ${dieName(lost)} to the pool.`, 'loss');
    }
    if (p.dice.length === 0) {
      p.eliminated = true;
      addLog(`${p.name} has been eliminated!`, 'loss');
    }
  });

  updatePool();
  renderPlayers(false, winner, losers);

  // Flash cards
  flashCards(winner, losers);

  // Handle winner's choice
  setTimeout(() => {
    if (winner.isHuman) {
      showHumanChoice(winner);
    } else {
      const choice = winner.getAIChoice();
      const prevDie = winner.chosenDie; // save before apply modifies it
      winner.applyChoice(choice);
      const verb = choice === 'duplicate'
        ? `duplicated their ${dieName(prevDie)}`
        : `upgraded to ${dieName(winner.bestDie)}`;
      addLog(`${winner.name} ${verb}.`, 'info');
      renderPlayers();
      checkWinCondition(winner);
    }
  }, 1200);
}

// ---- Flash animations ----

function flashCards(winner, losers) {
  const cards = document.querySelectorAll('.player-card');
  cards.forEach(card => {
    const name = card.dataset.name;
    if (name === winner.name) card.classList.add('winner-flash');
    else if (losers.some(l => l.name === name)) card.classList.add('loser-flash');

    setTimeout(() => {
      card.classList.remove('winner-flash', 'loser-flash');
    }, 1800);
  });
}

// ---- Results display ----

function showResults(active, winner) {
  const list = document.getElementById('results-list');
  list.innerHTML = '';

  const sorted = [...active].sort((a, b) => b.roundScore - a.roundScore);
  sorted.forEach(p => {
    const row = document.createElement('div');
    row.className = `result-row ${p === winner ? 'winner-row' : 'loser-row'}`;
    row.innerHTML = `
      <span class="result-name">${p.name}</span>
      <span class="result-die-badge" style="background:${DIE_COLOR[p.chosenDie]};color:#000">
        ${dieName(p.chosenDie)}
      </span>
      <span class="result-score">${p.roundScore.toLocaleString()}</span>
      ${p === winner ? '<span class="result-crown">👑</span>' : ''}
    `;
    list.appendChild(row);
  });

  showSection('results-section');
}

// ---- Human choice ----

function showHumanChoice(winner) {
  const idx = DICE_SIDES.indexOf(winner.chosenDie);
  const canUpgrade = idx < DICE_SIDES.length - 1;
  const nextDie = canUpgrade ? DICE_SIDES[idx + 1] : null;

  document.getElementById('duplicate-desc').textContent =
    `Get a 2nd ${dieName(winner.chosenDie)} — now you have two!`;

  document.getElementById('upgrade-desc').textContent = canUpgrade
    ? `${dieName(winner.chosenDie)} → ${dieName(nextDie)}`
    : `Already at D100 — duplicate instead`;

  // Disable upgrade if at max
  document.getElementById('upgrade-btn').disabled = !canUpgrade;

  showSection('choice-section');
  state.phase = 'choice';
}

document.getElementById('duplicate-btn').addEventListener('click', () => applyHumanChoice('duplicate'));
document.getElementById('upgrade-btn').addEventListener('click', () => applyHumanChoice('upgrade'));

function applyHumanChoice(choice) {
  const winner = state.players[0];
  const prevDie = winner.chosenDie;
  winner.applyChoice(choice);

  const verb = choice === 'duplicate'
    ? `duplicated your ${dieName(prevDie)}`
    : `upgraded to ${dieName(winner.bestDie)}`;
  addLog(`You ${verb}.`, 'info');

  hideSection('choice-section');
  hideSection('results-section');
  renderPlayers();
  checkWinCondition(winner);
}

// ---- Win condition ----

function checkWinCondition(roundWinner) {
  const cfg = DIFFICULTY[state.difficulty];

  for (const p of state.players) {
    if (p.d100Count >= cfg.targetD100s) {
      endGame(p);
      return;
    }
  }

  const alive = state.players.filter(p => !p.eliminated);
  if (alive.length === 1) {
    endGame(alive[0]);
    return;
  }

  // Human eliminated → game over (lose)
  if (state.players[0].eliminated) {
    endGame(null);
    return;
  }

  // Continue to next round via button
  showSection('continue-section');
  state.phase = 'continue';
}

document.getElementById('continue-btn').addEventListener('click', () => {
  hideSection('continue-section');
  hideSection('results-section');
  startRound();
});

// ============================================================
//  END GAME
// ============================================================

function endGame(winner) {
  state.phase = 'over';

  if (winner) {
    document.getElementById('win-icon').textContent = winner.isHuman ? '🏆' : '💀';
    document.getElementById('win-title').textContent = winner.isHuman ? 'YOU WIN!' : `${winner.name} Wins`;
    document.getElementById('win-title').className = winner.isHuman ? 'win' : 'lose';
    document.getElementById('win-subtitle').textContent = winner.isHuman
      ? `You reached ${DIFFICULTY[state.difficulty].targetD100s}× D100 — the dice are yours!`
      : `${winner.name} collected ${DIFFICULTY[state.difficulty].targetD100s}× D100 first.`;
  } else {
    document.getElementById('win-icon').textContent = '☠️';
    document.getElementById('win-title').textContent = 'ELIMINATED';
    document.getElementById('win-title').className = 'lose';
    document.getElementById('win-subtitle').textContent = 'You ran out of dice. Better luck next time!';
  }

  document.getElementById('win-stats').innerHTML =
    `<span>Round ${state.round}</span>
     <span>·</span>
     <span>Pool: ${state.pool.length} dice</span>`;

  // Show pool reward if human won
  if (winner && winner.isHuman && state.pool.length > 0) {
    const display = document.getElementById('pool-dice-display');
    display.innerHTML = state.pool.map(s => dieChipHTML(s)).join('');
    document.getElementById('pool-reward').classList.remove('hidden');
  } else {
    document.getElementById('pool-reward').classList.add('hidden');
  }

  showScreen('win-screen');

  if (winner && winner.isHuman) {
    startDiceShower();
  }
}

// ============================================================
//  DICE SHOWER ANIMATION
// ============================================================

function startDiceShower() {
  const shower = document.getElementById('dice-shower');
  shower.innerHTML = '';

  let count = 0;
  const max = 60;

  const interval = setInterval(() => {
    if (count >= max) { clearInterval(interval); return; }
    count++;

    const sides = DICE_SIDES[Math.floor(Math.random() * DICE_SIDES.length)];
    const size = 30 + Math.random() * 30;
    const left = Math.random() * 100;
    const duration = 2 + Math.random() * 3;
    const delay = Math.random() * 0.5;

    const die = document.createElement('div');
    die.className = 'shower-die';
    die.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      font-size: ${size * 0.28}px;
      background: ${DIE_COLOR[sides]};
      left: ${left}%;
      animation-duration: ${duration}s;
      animation-delay: ${delay}s;
    `;
    die.textContent = dieName(sides);
    shower.appendChild(die);

    // Remove after animation
    setTimeout(() => die.remove(), (duration + delay) * 1000 + 200);
  }, 80);
}

// ============================================================
//  RENDER FUNCTIONS
// ============================================================

function renderPlayers(showRolling = false, winner = null, losers = []) {
  const grid = document.getElementById('players-grid');
  grid.innerHTML = '';

  state.players.forEach(p => {
    const card = document.createElement('div');
    card.className = `player-card ${p.isHuman ? 'human' : ''} ${p.eliminated ? 'eliminated' : ''}`;
    card.dataset.name = p.name;

    // Header row
    const nameRow = document.createElement('div');
    nameRow.className = 'player-name';
    nameRow.textContent = p.name;

    if (p.isHuman) {
      const you = document.createElement('span');
      you.className = 'you-badge';
      you.textContent = 'YOU';
      nameRow.appendChild(you);
    }

    if (p.isProtected && !p.eliminated) {
      const prot = document.createElement('span');
      prot.className = 'protected-badge';
      prot.textContent = '🛡 Protected';
      nameRow.appendChild(prot);
    }

    card.appendChild(nameRow);

    // Dice
    const diceRow = document.createElement('div');
    diceRow.className = 'player-dice';

    p.dice.forEach(sides => {
      const chip = document.createElement('div');
      chip.className = 'die-chip';

      const isChosen = (sides === p.chosenDie && !p.eliminated);
      if (isChosen && showRolling) chip.classList.add('rolling');
      else if (isChosen && state.phase !== 'setup') chip.classList.add('chosen');

      chip.style.background = DIE_COLOR[sides];
      chip.textContent = dieName(sides);
      diceRow.appendChild(chip);
    });

    card.appendChild(diceRow);

    // Score (after rolling)
    if (p.roundScore > 0 && !showRolling) {
      const scoreEl = document.createElement('div');
      scoreEl.className = 'player-score';
      scoreEl.innerHTML = `Score: <span class="score-val">${p.roundScore.toLocaleString()}</span>`;
      card.appendChild(scoreEl);
    }

    // D100 progress dots
    const cfg = DIFFICULTY[state.difficulty];
    if (cfg.targetD100s > 1) {
      const progress = document.createElement('div');
      progress.className = 'd100-progress';
      for (let i = 0; i < cfg.targetD100s; i++) {
        const dot = document.createElement('div');
        dot.className = `d100-dot ${i < p.d100Count ? 'filled' : ''}`;
        dot.title = `D100 ${i + 1}`;
        progress.appendChild(dot);
      }
      card.appendChild(progress);
    }

    // Eliminated overlay
    if (p.eliminated) {
      const overlay = document.createElement('div');
      overlay.className = 'elim-overlay';
      overlay.textContent = 'ELIMINATED';
      card.appendChild(overlay);
    }

    grid.appendChild(card);
  });
}

function updatePool() {
  const mini = document.getElementById('pool-mini');
  mini.innerHTML = state.pool.slice(-20).map(s => poolDieHTML(s)).join('');
}
