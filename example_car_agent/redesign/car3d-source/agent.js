export function fresh() {
    return {
      driving: false, tempD: 21, tempP: 21, fan: 3, air: 'face',
      defrost: false, defrostR: false, seatD: null, seatP: null, wheel: false,
      win: { FL: 0, FR: 0, RL: 0, RR: 0 }, doors: { FL: 0, FR: 0, RL: 0, RR: 0 }, locked: false,
      roof: 'close', trunk: 'close', frunk: false, port: false, ambient: null, focus: false,
      vol: 12, muted: false, source: 'Radio', pop: null
    };
  }
export function understand(raw, car0) {
    const t = raw.toLowerCase();
    const pt = /[ãõçáéíóúâêô]|\b(o|a|do|da|pra|para|me|tá|tô|liga|abre|fecha|toca)\b/.test(t);
    const L = (en, p) => (pt ? p : en);
    const car = JSON.parse(JSON.stringify(car0));
    const num = (t.match(/(\d+(?:[.,]\d+)?)/) || [])[1];
    const isOpen = /(open|abr|abaix|desce|down)/.test(t);
    const isClose = /(close|fech|sobe|shut|up\b)/.test(t);
    const pos = () => /(all|todos|todas|tudo|every)/.test(t) ? ['FL', 'FR', 'RL', 'RR']
      : /(rear left|traseir[oa] esquerd)/.test(t) ? ['RL'] : /(rear right|traseir[oa] direit)/.test(t) ? ['RR']
      : /(rear|back|traseir|de trás)/.test(t) ? ['RL', 'RR'] : /(passenger|passageiro|carona|direit)/.test(t) ? ['FR'] : ['FL'];
    const posName = (p) => p.length === 4 ? L('all', 'todos') : p.length === 2 ? L('rear', 'traseiros') : ({ FL: L('driver', 'do motorista'), FR: L('passenger', 'do passageiro'), RL: L('rear left', 'traseiro esquerdo'), RR: L('rear right', 'traseiro direito') })[p[0]];
    const ok = (title, call, reply) => ({ car, last: { heard: '“' + raw + '”', title, call, reply, ok: true } });
    const no = (title, call, reply) => ({ car: car0, last: { heard: '“' + raw + '”', title, call, reply, ok: false } });

    if (/(sunroof|teto)/.test(t)) {
      const st = /(tilt|inclin)/.test(t) ? 'tilt' : isClose ? 'close' : 'open';
      car.roof = st;
      return ok({ open: 'Opened the sunroof', tilt: 'Tilted the sunroof', close: 'Closed the sunroof' }[st], 'set_sunroof(state: ' + st + ')', L('Sunroof ' + (st === 'close' ? 'closed' : st === 'tilt' ? 'tilted' : 'open') + '.', st === 'close' ? 'Fechei o teto solar.' : st === 'tilt' ? 'Inclinei o teto solar.' : 'Abri o teto solar.'));
    }
    if (/(defrost|desemba|embaç|embac)/.test(t)) {
      const on = !isClose && !/(off|deslig)/.test(t); car.defrost = on; car.defrostR = on; if (on) car.air = 'windshield';
      return ok(on ? 'Defrost on' : 'Defrost off', 'set_defrost(target: windshield, on: ' + on + ')', L('Defrost ' + (on ? 'on.' : 'off.'), on ? 'Desembaçador ligado.' : 'Desembaçador desligado.'));
    }
    if (/(charge|charging|carregador|tampa de carga|porta de carga)/.test(t)) {
      car.port = !isClose; return ok(car.port ? 'Opened the charge port' : 'Closed the charge port', 'set_charge_port(state: ' + (car.port ? 'open' : 'close') + ')', L('Done.', 'Pronto.'));
    }
    if (/(trunk|porta-malas|porta malas|mala)/.test(t)) {
      const st = isClose ? 'close' : 'open';
      if (st === 'open' && car0.driving) return no('Blocked: trunk can’t open while driving', 'set_trunk(target: trunk, state: open)', L('I can’t open the trunk while the car is moving.', 'Não posso abrir o porta-malas com o carro em movimento.'));
      car.trunk = st;
      return ok(st === 'open' ? 'Opened the trunk' : 'Closed the trunk', 'set_trunk(target: trunk, state: ' + st + ')', L('Trunk ' + (st === 'open' ? 'open.' : 'closed.'), st === 'open' ? 'Abri o porta-malas.' : 'Fechei o porta-malas.'));
    }
    if (/(frunk|capô|capo|hood)/.test(t)) {
      if (!isClose && car0.driving) return no('Blocked: frunk can’t open while driving', 'set_trunk(target: frunk, state: open)', L('Not while driving.', 'Não com o carro em movimento.'));
      car.frunk = !isClose;
      return ok(isClose ? 'Closed the frunk' : 'Opened the frunk', 'set_trunk(target: frunk, state: ' + (isClose ? 'close' : 'open') + ')', L('Done.', 'Pronto.'));
    }
    if (/(window|vidro|janela)/.test(t)) {
      const lvl = isClose ? 0 : /(half|metade|meio)/.test(t) ? 0.5 : /(crack|pouco|fresta|little)/.test(t) ? 0.2 : 1;
      const p = pos();
      p.forEach((k) => { car.win[k] = lvl; });
      const st = lvl === 0 ? 'close' : lvl === 0.5 ? 'half' : lvl === 0.2 ? 'crack' : 'open';
      return ok((lvl === 0 ? 'Closed ' : 'Opened ') + 'the ' + ({ FL: 'driver', FR: 'passenger', RL: 'rear left', RR: 'rear right' })[p[0]] + (p.length > 1 ? ' + more' : '') + ' window' + (st === 'half' ? ' halfway' : st === 'crack' ? ' a crack' : ''), 'set_window(position: ' + (p.length === 4 ? 'all' : p.length === 2 ? 'rear' : ({ FL: 'driver', FR: 'passenger', RL: 'rear_left', RR: 'rear_right' })[p[0]]) + ', state: ' + st + ')', L('Window ' + (lvl ? 'open.' : 'closed.'), (lvl ? 'Abri' : 'Fechei') + ' o vidro ' + posName(p) + '.'));
    }
    if (/(unlock|destranc|destrav)/.test(t)) { car.locked = false; return ok('Unlocked the car', 'unlock_car()', L('Car unlocked.', 'Carro destrancado.')); }
    if (/(lock|tranc|trav)/.test(t)) {
      if (Object.values(car0.doors).some(Boolean)) return no('Blocked: a door is open', 'lock_car()', L('Close the doors first.', 'Feche as portas primeiro.'));
      car.locked = true; return ok('Locked the car', 'lock_car()', L('Car locked.', 'Carro trancado.'));
    }
    if (/(door|porta)/.test(t)) {
      if (isClose) { car.doors = { FL: 0, FR: 0, RL: 0, RR: 0 }; return ok('Closed the doors', 'close_doors()', L('Doors closed.', 'Fechei as portas.')); }
      if (car0.driving) return no('Blocked: doors can’t open while driving', 'open_door(position: ' + 'driver)', L('Not while driving.', 'Não com o carro em movimento.'));
      if (car0.locked) car.locked = false;
      const p = pos(); p.forEach((k) => { car.doors[k] = 1; });
      return ok('Opened the ' + ({ FL: 'driver', FR: 'passenger', RL: 'rear left', RR: 'rear right' })[p[0]] + ' door', 'open_door(position: ' + ({ FL: 'driver', FR: 'passenger', RL: 'rear_left', RR: 'rear_right' })[p[0]] + ')', L('Door open.', 'Abri a porta.'));
    }
    if (/(cold|frio|congel|gelad)/.test(t)) {
      car.seatD = 'heat'; car.wheel = true; car.tempD = Math.min(28, car0.tempD + 2); car.tempP = car.tempD;
      return ok('Warming you up', 'comfort_feeling(feeling: cold)', L('Seat and steering wheel heating on, and a bit warmer.', 'Liguei o aquecimento do banco e do volante.'));
    }
    if (/(hot|calor|quente|abafad)/.test(t)) {
      car.seatD = 'vent'; car.wheel = false; car.tempD = Math.max(16, car0.tempD - 2); car.tempP = car.tempD; car.fan = Math.min(7, car0.fan + 2); car.air = 'face';
      return ok('Cooling you down', 'comfort_feeling(feeling: hot)', L('Seat ventilation on and cooler air.', 'Liguei a ventilação do banco e esfriei o ar.'));
    }
    if (/(steering|volante)/.test(t)) {
      const on = !/(off|deslig)/.test(t); car.wheel = on;
      return ok(on ? 'Heated steering wheel on' : 'Heated steering wheel off', 'set_steering_wheel_heater(on: ' + on + ')', L('Done.', 'Pronto.'));
    }
    if (/(seat|banco)/.test(t)) {
      const off = /(off|deslig)/.test(t); const k = /(vent|cool|resfr|ventila)/.test(t) ? 'vent' : 'heat';
      const who = /(passenger|passageiro|carona)/.test(t) ? 'seatP' : 'seatD';
      car[who] = off ? null : k;
      return ok((off ? 'Seat climate off' : k === 'heat' ? 'Seat heating high' : 'Seat ventilation on') + (who === 'seatP' ? ' · passenger' : ' · driver'), 'set_seat_climate(seat: ' + (who === 'seatP' ? 'passenger' : 'driver') + ', mode: ' + k + ', level: ' + (off ? 0 : 3) + ')', L('Done.', 'Pronto.'));
    }
    if (/(fan|ventila)/.test(t)) {
      const n = num ? Math.round(parseFloat(num)) : (/(up|aument|mais|faster)/.test(t) ? car0.fan + 1 : car0.fan - 1);
      car.fan = Math.max(1, Math.min(7, n));
      return ok('Fan speed ' + car.fan, 'set_fan_speed(level: ' + car.fan + ')', L('Fan at ' + car.fan + '.', 'Ventilação no ' + car.fan + '.'));
    }
    if (/(temp|graus|degree|\bac\b|\bar\b|ar-condicionado|ar condicionado|warmer|cooler|esquent|esfri)/.test(t)) {
      let v = num ? parseFloat(num.replace(',', '.')) : (/(warmer|esquent|aument)/.test(t) ? car0.tempD + 1 : car0.tempD - 1);
      v = Math.max(16, Math.min(28, Math.round(v)));
      const side = /(passenger|passageiro)/.test(t) ? 'P' : /(driver|motorista)/.test(t) ? 'D' : 'both';
      if (side !== 'P') car.tempD = v; if (side !== 'D') car.tempP = v;
      return ok('Temperature ' + v + '°' + (side === 'both' ? '' : side === 'D' ? ' · driver' : ' · passenger'), 'set_temperature(zone: ' + (side === 'both' ? 'all' : side === 'D' ? 'driver' : 'passenger') + ', value: ' + v + ')', L('Set to ' + v + ' degrees.', 'Coloquei em ' + v + ' graus.'));
    }
    if (/(ambient|light|luz|luzes|ilumina)/.test(t)) {
      const colors = { blue: '#60A5FA', azul: '#60A5FA', red: '#F87171', vermelh: '#F87171', purple: '#C084FC', roxo: '#C084FC', green: '#34D399', verde: '#34D399', orange: '#FB923C', laranja: '#FB923C' };
      const off = /(off|deslig|apag)/.test(t);
      let col = '#2DD4BF', name = 'teal';
      const en = { azul: 'blue', vermelh: 'red', roxo: 'purple', verde: 'green', laranja: 'orange' };
      Object.keys(colors).forEach((k) => { if (t.includes(k)) { col = colors[k]; name = en[k] || k; } });
      car.ambient = off ? null : col;
      return ok(off ? 'Ambient light off' : 'Ambient light ' + name, 'set_cabin_lights(target: ambient, on: ' + !off + (off ? '' : ', color: ' + name) + ')', L('Done.', 'Pronto.'));
    }
    if (/(take me|navigate|me leva|leva pra|go to|ir para|vamos pra|rota)/.test(t)) {
      const home = /(home|casa)/.test(t); const dest = home ? L('Home', 'Casa') : (raw.split(/ (?:to|pra|para|ao|à) /i).pop() || 'destination');
      car.pop = { text: '→ ' + dest, meta: home ? '18 min · 12 km' : '25 min · 17 km' };
      return ok('Navigating to ' + dest, 'navigate_to(destination: ' + (home ? 'home' : dest) + ')', L('On our way. Arriving in ' + (home ? 18 : 25) + ' minutes.', 'Indo para ' + dest + ', chegada em ' + (home ? 18 : 25) + ' minutos.'));
    }
    if (/(call|liga pra|ligar pra|ligar para|liga para|telefona)/.test(t)) {
      const name = (raw.match(/(?:call|pra|para)\s+([A-Za-zÀ-ÿ]+)/i) || [, 'Ana'])[1];
      car.pop = { text: 'Calling ' + name, meta: '00:03' }; car.focus = true; car.source = 'Phone';
      return ok('Calling ' + name, 'call_contact(contact: ' + name + ')', L('Calling ' + name + '.', 'Ligando para ' + name + '.'));
    }
    if (/(mute|mudo|silenc)/.test(t)) { car.muted = !/(unmute|desmut)/.test(t); return ok(car.muted ? 'Muted' : 'Unmuted', 'set_volume(mute: ' + car.muted + ')', L('Done.', 'Pronto.')); }
    if (/(volume|louder|quieter|aumenta o som|abaixa o som|mais alto|mais baixo)/.test(t)) {
      const v = num ? Math.round(parseFloat(num)) : (/(up|louder|aumenta|mais alto)/.test(t) ? car0.vol + 3 : car0.vol - 3);
      car.vol = Math.max(0, Math.min(30, v)); car.muted = false;
      return ok('Volume ' + car.vol, 'set_volume(level: ' + car.vol + ')', L('Volume ' + car.vol + '.', 'Volume no ' + car.vol + '.'));
    }
    if (/(radio|rádio|\bfm\b|sintoniza|\d+[.,]\d)/.test(t)) {
      const f = num ? num.replace(',', '.') : '98.5'; car.source = 'FM ' + f; car.pop = { text: '♪ FM ' + f, meta: 'Radio' };
      return ok('Tuned to FM ' + f, 'tune_radio(band: FM, frequency: ' + f + ')', L('Tuned to ' + f + '.', 'Sintonizei na ' + f + '.'));
    }
    if (/(play|toca|tocar|música|musica|song)/.test(t)) {
      const what = raw.replace(/^(play|toca|tocar)\s*/i, '') || 'music'; car.source = 'Spotify'; car.pop = { text: '♪ ' + what, meta: 'Spotify' };
      return ok('Playing ' + what, 'play_media(query: ' + what + ')', L('Playing ' + what + '.', 'Tocando ' + what + '.'));
    }
    if (/(fuel|combust|gasolina|range|autonomia|bateria|battery)/.test(t)) {
      car.pop = { text: 'Fuel 68% · 520 km range', meta: '6.8 L/100 km' };
      return ok('Vehicle status', 'get_vehicle_status(item: fuel)', L('68% fuel, about 520 km of range.', 'Você tem 68% de combustível, cerca de 520 km.'));
    }
    return no('Needs the remote agent', '— no local tool matched —', L('For this command I need a remote agent.', 'Para este comando eu preciso de um agente remoto.'));
  }
