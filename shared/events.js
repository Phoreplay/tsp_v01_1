/* TPS v0 · shared/events.js
   Контракт событий. Симуляция детерминирована: (состояние, решения, seed) -> поток событий.
   Слой эффектов и UI только читают события и ничего не решают. Синхрон позже гонит по сети
   только решения подготовки, поток событий у обоих клиентов получается одинаковый.

   Общие поля каждого события: type, t (мс времени симуляции).
   side: 0 | 1. Симуляция не знает, кто снизу. В матче с ботом 0 это игрок,
   цвет и верх/низ решает слой вида.
   cell: индекс клетки r * cols + k, ряд 0 у борта, который в начале смотрит на соперника.
   cannon: { board: 0 | 1, slot }. Борт 0 в начале раунда обращён к сопернику.
   unit: { id, type: 'gunner' | 'shooter' | 'boarder', rank: 1..3 }. Ранг 3 это супер. */
(function (root) {
  'use strict';
  var TPS = root.TPS = root.TPS || {};

  // src: 'sim' приходит из симуляции, 'ui' рождается во флоу и нужен только эффектам.
  var DEF = {
    // фазы и флоу
    phase:   { src: 'sim', f: ['phase', 'round', 'ms'], d: 'смена фазы: search, vs, enter, prep, battle, roundEnd, cards, boarding, results, return; ms длительность или 0 до нажатия; у roundEnd есть result' },
    banner:  { src: 'ui',  f: ['key', 'text', 'ms'], d: 'баннер, встаёт в очередь, на фразу из 2-3 слов не меньше 500 мс' },
    drag:    { src: 'ui',  f: ['step', 'id'], d: 'step: start, over, drop, cancel; target: cell | hire. Нужен для состояний Reroll и подсветки пар' },

    // подготовка
    hire:    { src: 'sim', f: ['side', 'unit', 'cell', 'price', 'next'], d: 'найм: тип случайный по весам, клетка случайная свободная; next цена следующего найма' },
    move:    { src: 'sim', f: ['side', 'id', 'from', 'to'], d: 'перестановка, бесплатно; swap: id второго матроса, если клетка была занята' },
    merge:   { src: 'sim', f: ['side', 'ids', 'unit', 'cell', 'n'], d: 'n = 2 даёт +1 ранг, n = 3 рядом даёт +2 ранга; unit уже с новым рангом' },
    barrel:  { src: 'sim', f: ['side', 'cell', 'coins'], d: 'мерж рядом разбил бочку: монеты сразу и свободная клетка' },
    reroll:  { src: 'sim', f: ['side', 'id', 'from', 'to', 'price'], d: 'матрос стал другим типом, ранг и клетка те же' },
    deny:    { src: 'sim', f: ['side', 'action', 'reason'], d: 'отказ: no_money, super_locked, ready_locked, board_full. Эффект качания «нет»' },
    ready:   { src: 'sim', f: ['side'], d: 'сторона нажала Ready или таймер вышел; auto: true если игра донаняла сама' },
    coins:   { src: 'sim', f: ['side', 'delta', 'total', 'src'], d: 'любое изменение дублонов; src: start, hire, reroll, barrel, income, kill' },
    income:  { src: 'sim', f: ['side', 'value'], d: 'метка «+X»: доход следующей подготовки, растёт от убийств' },
    cards:   { src: 'sim', f: ['side', 'offer'], d: 'три разные карты [{ type: curse | storm | healer | powder | rum | bubble, rarity: 0..2 }]' },
    pick:    { src: 'sim', f: ['side', 'index', 'auto'], d: 'выбор карты; auto если время вышло' },

    // бой
    pass:    { src: 'sim', f: ['n', 'ms'], d: 'заход 1 или 2; перед вторым разворот, к сопернику поворачивается борт 1' },
    fire:    { src: 'sim', f: ['side', 'cannon', 'weapon', 'boost'], d: 'выстрел пушки; weapon: culverin, carronade; boost: id канониров рядом для анимации' },
    impact:  { src: 'sim', f: ['side', 'target', 'dmg'], d: 'попадание в корабль side: target hull, cannon, miss; для hull есть hp и pct, для cannon есть cannon и state: smoking, broken' },
    attack:  { src: 'sim', f: ['side', 'id', 'target', 'weapon'], d: 'атака матроса: musket, melee, swab' },
    hit:     { src: 'sim', f: ['side', 'id', 'dmg', 'hp'], d: 'урон матросу; dmg < 0 это лечение (карта Перевязки)' },
    death:   { src: 'sim', f: ['side', 'id', 'cell', 'coins'], d: 'смерть: монеты ложатся на палубу; в конце раунда летят к убийце, после последнего боя переплавляются в добычу' },
    board:   { src: 'sim', f: ['attacker', 'defender', 'power'], d: 'старт абордажа; power [сила 0, сила 1] для полоски перетягивания' },
    ramp:    { src: 'sim', f: ['mult'], d: 'с 15-й секунды абордажа урон растёт на 25% каждые 5 с' },
    status:  { src: 'sim', f: ['side', 'id', 'kind'], d: 'эффект карты на бойце: curse (stacks, sec), bubble (n), rage (sec); stacks 0 или n 0 снимают' },
    tick:    { src: 'sim', f: ['side', 'id', 'dmg', 'hp'], d: 'урон от эффекта во времени, kind: curse' },
    chain:   { src: 'sim', f: ['side', 'from', 'to'], d: 'молния Шторма: side владелец карты, from id цели удара, to id задетых по порядку' },
    blast:   { src: 'sim', f: ['side', 'cell'], d: 'взрыв Пороховой бочки на клетке погибшего; side сторона погибшего, ids задетых' },
    shield:  { src: 'sim', f: ['side', 'id', 'left'], d: 'Пузырь поглотил удар, left зарядов осталось' },
    sink:    { src: 'sim', f: ['side'], d: 'корабль потоплен' },
    end:     { src: 'sim', f: ['winner', 'outcome', 'gold', 'trophies', 'reason', 'hint'], d: 'outcome: sink, wipe, board; gold уже включает добычу (дублоны последнего боя × lootRate); blueprint если выпал чертёж' }
  };

  function bus(opts) {
    var dev = !opts || opts.dev !== false;
    var subs = {};
    var log = [];
    function on(type, fn) { (subs[type] = subs[type] || []).push(fn); return function () { off(type, fn); }; }
    function off(type, fn) { var a = subs[type]; if (a) { var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
    function emit(ev) {
      if (dev) {
        var def = DEF[ev.type];
        if (!def) console.warn('[TPS] неизвестное событие', ev.type, ev);
        else for (var i = 0; i < def.f.length; i++) if (!(def.f[i] in ev)) console.warn('[TPS] у события', ev.type, 'нет поля', def.f[i], ev);
      }
      log.push(ev);
      var a = (subs[ev.type] || []).concat(subs['*'] || []);
      for (var j = 0; j < a.length; j++) a[j](ev);
    }
    return { on: on, off: off, emit: emit, log: log };
  }

  TPS.EVENTS = { DEF: DEF, bus: bus, count: Object.keys(DEF).length };
})(typeof window !== 'undefined' ? window : globalThis);
