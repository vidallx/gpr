// ==========================================
// CONFIGURACIÓN SUPABASE (REEMPLAZAR CON TUS DATOS)
// ==========================================
const SUPABASE_URL = 'https://doyzequfqtdjtnldewhh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXplcXVmcXRkanRubGRld2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODA4NTksImV4cCI6MjA5NzA1Njg1OX0.hBE_AwyEfKX1pF0rk2No3loAVAVJ6U6AjusAvjQTQmI';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// ESTADO GLOBAL
// ==========================================
let currentUser = null;
let currentRoutine = { exercises: [], totalTime: 0 };
let timerInterval = null;
let isPaused = true;
let queue = []; 
let currentQueueIndex = 0;
let timeLeftInPhase = 0;
let editIndex = -1; // Para la función de modificar

// ==========================================
// 1. AUTENTICACIÓN
// ==========================================
async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return showMessage(error.message);
    currentUser = data.user;
    initApp();
}

async function register() {
    const name = document.getElementById('user-name').value.trim();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    if (!name) return showMessage('⚠️ Ingresa tu nombre.');
    
    const { data, error } = await supabaseClient.auth.signUp({
        email, password, options: { data: { full_name: name } }
    });
    if (error) return showMessage('Error: ' + error.message);
    showMessage('✅ Registro exitoso. ¡Bienvenido ' + name + '!');
    currentUser = data.user;
    setTimeout(() => initApp(), 1500);
}

function showMessage(msg) { document.getElementById('auth-message').innerText = msg; }

function initApp() {
    showInterface('programmer-section');
    const userName = currentUser.user_metadata?.full_name || (currentUser.email ? currentUser.email.split('@')[0] : 'Atleta');
    speakRandomGreeting(userName);
}

// ==========================================
// 2. ASISTENTE DE VOZ
// ==========================================
const phrases = [
    "Bienvenido {name}, listo para sudar", "Vamos a romperla hoy, {name}", "El dolor es temporal, la gloria es eterna, {name}",
    "A darle con todo, {name}", "Tu único límite eres tú, {name}", "Hoy se construye el cuerpo del mañana, {name}",
    "No pares hasta estar orgulloso, {name}", "La disciplina vence al talento, {name}", "Suda ahora, brilla después, {name}",
    "Cada repetición cuenta, {name}", "Haz que cada segundo valga, {name}", "Tu cuerpo puede, convence a tu mente, {name}",
    "A entrenar se ha dicho, {name}", "Sin excusas, solo resultados, {name}", "La magia sucede fuera de tu zona de confort, {name}",
    "Convierte el dolor en poder, {name}", "Hoy es un buen día para ser fuerte, {name}", "El éxito es la suma de pequeños esfuerzos, {name}",
    "No cuentes los días, haz que los días cuenten, {name}", "Tu futuro te está esperando, {name}", "Dale duro, {name}",
    "La consistencia es la clave, {name}", "Supera tus límites, {name}", "Vamos a esculpir esa obra de arte, {name}"
];

function speakRandomGreeting(name) {
    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)].replace('{name}', name);
    speak(randomPhrase);
}

function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es-ES';
        utterance.rate = 1.15;
        window.speechSynthesis.speak(utterance);
    }
}

// ==========================================
// 3. PROGRAMADOR DE RUTINAS (CON LÓGICA AVANZADA)
// ==========================================
function addExercise() {
    const ex = {
        name: document.getElementById('ex-name').value,
        sets: parseInt(document.getElementById('ex-sets').value) || 1,
        reps: parseInt(document.getElementById('ex-reps').value) || 1,
        weight: document.getElementById('ex-weight').value,
        equipment: document.getElementById('ex-equipment').value,
        quantity: parseInt(document.getElementById('ex-quantity').value),
        tempo: {
            ecc: parseInt(document.getElementById('tempo-ecc').value) || 0,
            pb: parseInt(document.getElementById('tempo-pb').value) || 0,
            con: parseInt(document.getElementById('tempo-con').value) || 0,
            pt: parseInt(document.getElementById('tempo-pt').value) || 0
        },
        rest: {
            set: parseInt(document.getElementById('rest-set').value) || 0,
            trans: parseInt(document.getElementById('rest-trans').value) || 10,
            ex: parseInt(document.getElementById('rest-ex').value) || 0
        }
    };

    if (!ex.name) return alert('Ingresa un nombre de ejercicio');

    if (editIndex >= 0) {
        currentRoutine.exercises[editIndex] = ex;
        editIndex = -1;
        document.querySelector('button[onclick="addExercise()"]').innerText = 'Añadir Ejercicio';
    } else {
        currentRoutine.exercises.push(ex);
    }

    calculateTotalTime();
    renderExerciseList();
    
    // Limpiar inputs
    document.getElementById('ex-name').value = '';
    document.getElementById('ex-sets').value = '';
    document.getElementById('ex-reps').value = '';
    document.getElementById('ex-weight').value = '';
}

function editExercise(index) {
    const ex = currentRoutine.exercises[index];
    editIndex = index;
    
    document.getElementById('ex-name').value = ex.name;
    document.getElementById('ex-sets').value = ex.sets;
    document.getElementById('ex-reps').value = ex.reps;
    document.getElementById('ex-weight').value = ex.weight;
    document.getElementById('ex-equipment').value = ex.equipment;
    document.getElementById('ex-quantity').value = ex.quantity;
    document.getElementById('tempo-ecc').value = ex.tempo.ecc;
    document.getElementById('tempo-pb').value = ex.tempo.pb;
    document.getElementById('tempo-con').value = ex.tempo.con;
    document.getElementById('tempo-pt').value = ex.tempo.pt;
    document.getElementById('rest-set').value = ex.rest.set;
    document.getElementById('rest-trans').value = ex.rest.trans;
    document.getElementById('rest-ex').value = ex.rest.ex;
    
    document.querySelector('button[onclick="addExercise()"]').innerText = 'Guardar Cambios';
    window.scrollTo(0, 0);
}

function deleteExercise(index) {
    currentRoutine.exercises.splice(index, 1);
    editIndex = -1;
    document.querySelector('button[onclick="addExercise()"]').innerText = 'Añadir Ejercicio';
    calculateTotalTime();
    renderExerciseList();
}

function calculateTotalTime() {
    let totalSeconds = 40; // Preparación inicial
    
    currentRoutine.exercises.forEach(ex => {
        const realSets = ex.sets * ex.quantity; // Caso A: x1, Caso B: x2
        const repCycle = ex.tempo.ecc + ex.tempo.pb + ex.tempo.con + ex.tempo.pt;
        
        for (let s = 1; s <= realSets; s++) {
            totalSeconds += (repCycle * ex.reps); // Tiempo de ejecución
            
            if (s < realSets) {
                if (ex.quantity === 1 && s % 2 !== 0) {
                    totalSeconds += ex.rest.trans; // Descanso de transición (Lado A a B)
                } else {
                    totalSeconds += ex.rest.set; // Descanso completo
                }
            }
        }
        totalSeconds += ex.rest.ex; // Descanso entre ejercicios
    });
    
    currentRoutine.totalTime = totalSeconds;
    document.getElementById('total-time-display').innerText = formatTime(totalSeconds);
}

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function renderExerciseList() {
    const list = document.getElementById('exercise-list');
    list.innerHTML = currentRoutine.exercises.map((ex, i) => {
        const realSets = ex.sets * ex.quantity;
        const sideNote = ex.quantity === 1 ? ` (Se realizarán ${realSets} series alternadas)` : '';
        return `
        <li style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #ddd;">
            <div>
                <strong>${i+1}. ${ex.name}</strong> ${sideNote}<br>
                <small>${ex.sets} series x ${ex.reps} reps | ${ex.equipment} (Cant: ${ex.quantity})</small>
            </div>
            <div>
                <button onclick="editExercise(${i})" style="width: auto; padding: 5px 10px; font-size: 12px; margin: 0 5px;">✏️</button>
                <button onclick="deleteExercise(${i})" class="danger" style="width: auto; padding: 5px 10px; font-size: 12px; margin: 0;">🗑️</button>
            </div>
        </li>`;
    }).join('');
}

function saveAndStartRoutine() {
    if (currentRoutine.exercises.length === 0) return alert('Añade al menos un ejercicio');
    localStorage.setItem('pending_routine', JSON.stringify(currentRoutine));
    buildTimerQueue();
    showInterface('executor-section');
    speak("Dispondrás de 40 segundos para prepararte");
}

// ==========================================
// 4. EJECUTOR (CRONOMETRAJE Y LÓGICA DE COLA AVANZADA)
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;

    if (type === 'metronome') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(1000, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'eccentric') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(250, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.5);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now); osc.stop(now + 0.8);
    } else if (type === 'concentric') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now); osc.stop(now + 0.8);
    } else if (type === 'pause-bottom') {
        playDoubleBeep(now);
    } else if (type === 'pause-top') {
        playTripleBeep(now);
    } else if (type === 'transition') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.3);
        gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    }
}

function playDoubleBeep(time) {
    const osc1 = audioCtx.createOscillator(); const gain1 = audioCtx.createGain();
    const osc2 = audioCtx.createOscillator(); const gain2 = audioCtx.createGain();
    osc1.connect(gain1); osc2.connect(gain2); gain1.connect(audioCtx.destination); gain2.connect(audioCtx.destination);
    osc1.type = 'sine'; osc1.frequency.setValueAtTime(600, time); gain1.gain.setValueAtTime(0.3, time); gain1.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    osc1.start(time); osc1.stop(time + 0.1);
    osc2.type = 'sine'; osc2.frequency.setValueAtTime(600, time + 0.2); gain2.gain.setValueAtTime(0.3, time + 0.2); gain2.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
    osc2.start(time + 0.2); osc2.stop(time + 0.3);
}

function playTripleBeep(time) {
    for (let i = 0; i < 3; i++) {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(1200, time + (i * 0.15));
        gain.gain.setValueAtTime(0.2, time + (i * 0.15)); gain.gain.exponentialRampToValueAtTime(0.01, time + (i * 0.15) + 0.08);
        osc.start(time + (i * 0.15)); osc.stop(time + (i * 0.15) + 0.08);
    }
}

function buildTimerQueue() {
    queue = [];
    queue.push({ phase: 'Preparación', duration: 40, action: 'prep' });

    currentRoutine.exercises.forEach((ex, exIndex) => {
        const realSets = ex.sets * ex.quantity;
        const nextExName = currentRoutine.exercises[exIndex + 1] ? currentRoutine.exercises[exIndex + 1].name : "el final de tu rutina";

        for (let s = 1; s <= realSets; s++) {
            // Determinar lado si es cantidad 1
            const isSideA = (s % 2 !== 0);
            const sideLabel = (ex.quantity === 1) ? (isSideA ? "Lado Izquierdo" : "Lado Derecho") : "";
            const isFirstPhaseOfSet = true; // Simplificado para anunciar al inicio de la serie

            // Fases de ejecución
            const phases = [];
            if (ex.tempo.ecc > 0) phases.push({ phase: 'Excéntrico', duration: ex.tempo.ecc, action: 'ecc' });
            if (ex.tempo.pb > 0) phases.push({ phase: 'Pausa Abajo', duration: ex.tempo.pb, action: 'pause-bottom' });
            if (ex.tempo.con > 0) phases.push({ phase: 'Concéntrico', duration: ex.tempo.con, action: 'con' });
            if (ex.tempo.pt > 0) phases.push({ phase: 'Pausa Arriba', duration: ex.tempo.pt, action: 'pause-top' });

            phases.forEach((p, idx) => {
                queue.push({
                    ...p,
                    exerciseName: ex.name,
                    setNumber: s,
                    totalRealSets: realSets,
                    sideLabel: sideLabel,
                    isFirstPhaseOfSet: (idx === 0),
                    nextExName: nextExName,
                    isLastSetOfExercise: (s === realSets)
                });
            });

            // Lógica de Descansos
            if (s < realSets) {
                if (ex.quantity === 1 && isSideA) {
                    // Caso B: Descanso de transición corto (Lado A a Lado B)
                    queue.push({ 
                        phase: 'Descanso de transición', 
                        duration: ex.rest.trans, 
                        action: 'rest-trans',
                        exerciseName: ex.name,
                        nextExName: nextExName
                    });
                } else {
                    // Descanso completo entre series (o después del Lado B)
                    queue.push({ 
                        phase: 'Descanso entre series', 
                        duration: ex.rest.set, 
                        action: 'rest',
                        exerciseName: ex.name,
                        nextExName: nextExName
                    });
                }
            } else {
                // Fin del ejercicio completo
                if (exIndex < currentRoutine.exercises.length - 1) {
                    queue.push({ 
                        phase: 'Descanso entre ejercicios', 
                        duration: ex.rest.ex, 
                        action: 'rest-exercise',
                        exerciseName: ex.name,
                        nextExName: nextExName
                    });
                }
            }
        }
    });
    
    queue.push({ phase: '¡Rutina Finalizada!', duration: 5, action: 'finish' });
    currentQueueIndex = 0;
    loadNextPhase();
}

function loadNextPhase() {
    if (currentQueueIndex >= queue.length) return;
    const item = queue[currentQueueIndex];
    timeLeftInPhase = item.duration;
    updateTimerUI(item);

    // ANUNCIOS DE VOZ
    if (item.action === 'prep' && timeLeftInPhase === 40) {
        speak("Comienza la preparación");
    } 
    else if (item.action === 'ecc' && item.isFirstPhaseOfSet) {
        const sideText = item.sideLabel ? `, ${item.sideLabel}` : "";
        speak(`Serie ${item.setNumber} de ${item.totalRealSets}, ${item.exerciseName}${sideText}. Exce`);
        playSound('eccentric');
    } 
    else if (item.action === 'ecc') {
        speak("Exce"); playSound('eccentric');
    }
    else if (item.action === 'pause-bottom') {
        speak("Pausa abajo"); playSound('pause-bottom');
    }
    else if (item.action === 'con') {
        speak("Conce"); playSound('concentric');
    } 
    else if (item.action === 'pause-top') {
        speak("Pausa arriba"); playSound('pause-top');
    }
    else if (item.action === 'rest-trans') {
        speak("Cambio de lado, descanso breve");
    }
    else if (item.action === 'rest' || item.action === 'rest-exercise') {
        if (item.action === 'rest-exercise') {
            speak(`Fin del ejercicio. Cambiaremos a ${item.nextExName}`);
            playSound('transition');
        } else {
            speak("Descanso");
        }
    }
    else if (item.action === 'finish') {
        speak("Felicidades, has completado tu rutina");
        saveHistory();
        setTimeout(() => showInterface('history-section'), 3000);
        return;
    }
}

function updateTimerUI(item) {
    let title = item.phase;
    if (item.exerciseName) {
        title = `${item.exerciseName}`;
        if (item.sideLabel) title += ` (${item.sideLabel})`;
        title += ` - Serie ${item.setNumber}/${item.totalRealSets}`;
    }
    document.getElementById('current-phase-title').innerText = title;
    document.getElementById('timer-seconds').innerText = timeLeftInPhase;
    
    const circle = document.querySelector('.progress-ring__circle');
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    const offset = circumference - (timeLeftInPhase / item.duration) * circumference;
    circle.style.strokeDashoffset = offset;
}

function tick() {
    if (isPaused) return;
    const currentItem = queue[currentQueueIndex];

    // Anuncios de voz durante cuenta regresiva (Prep y Descansos)
    const isRest = (currentItem.action === 'prep' || currentItem.action === 'rest' || currentItem.action === 'rest-trans' || currentItem.action === 'rest-exercise');
    
    if (isRest) {
        if (currentItem.action === 'prep' && timeLeftInPhase === 20) speak("Veinte segundos");
        if (timeLeftInPhase === 20) speak("Veinte segundos"); // Para descansos largos
        if (timeLeftInPhase <= 7 && timeLeftInPhase > 0) speak(timeLeftInPhase.toString());
    }

    timeLeftInPhase--;
    updateTimerUI(currentItem);

    // METRÓNOMO: SOLO en los últimos 7 segundos de descansos o preparación
    if (isRest && timeLeftInPhase <= 7 && timeLeftInPhase > 0) {
        playSound('metronome');
    }

    if (timeLeftInPhase <= 0) {
        currentQueueIndex++;
        if (currentQueueIndex < queue.length) {
            loadNextPhase();
        } else {
            clearInterval(timerInterval);
            finishRoutine();
        }
    }
}

function toggleTimer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    isPaused = !isPaused;
    document.getElementById('btn-start-pause').innerText = isPaused ? 'Reanudar' : 'Pausar';
    if (!isPaused) timerInterval = setInterval(tick, 1000);
    else clearInterval(timerInterval);
}

function finishRoutine() {
    clearInterval(timerInterval);
    speak("Rutina finalizada manualmente");
    saveHistory();
    showInterface('history-section');
}

// ==========================================
// 5. HISTORIAL Y SUPABASE
// ==========================================
async function saveHistory() {
    const record = {
        user_id: currentUser ? currentUser.id : 'guest',
        date: new Date().toISOString().split('T')[0],
        body_part: document.getElementById('body-part').value,
        day: document.getElementById('training-day').value,
        exercises: currentRoutine.exercises,
        total_time: currentRoutine.totalTime
    };
    let history = JSON.parse(localStorage.getItem('gym_history') || '[]');
    history.push(record);
    localStorage.setItem('gym_history', JSON.stringify(history));
    if (navigator.onLine && currentUser) await supabaseClient.from('routines').insert(record);
}

async function loadHistory() {
    const container = document.getElementById('history-list');
    container.innerHTML = '<p>Cargando...</p>';
    const sixWeeksAgo = new Date(); sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);
    let history = JSON.parse(localStorage.getItem('gym_history') || '[]');
    history = history.filter(h => new Date(h.date) >= sixWeeksAgo);
    localStorage.setItem('gym_history', JSON.stringify(history));

    if (navigator.onLine && currentUser) {
        const { data } = await supabaseClient.from('routines').select('*').eq('user_id', currentUser.id).order('date', { ascending: false });
        if (data) history = [...data, ...history].filter((v,i,a)=>a.findIndex(t=>(t.date===v.date && t.body_part===v.body_part))===i);
    }

    container.innerHTML = '';
    if (history.length === 0) { container.innerHTML = '<p>No hay registros recientes.</p>'; return; }

    history.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <button class="delete-btn" onclick="deleteHistory(${index})">×</button>
            <h3>${item.date} - ${item.body_part} (${item.day})</h3>
            <p>Tiempo total: ${formatTime(item.total_time)}</p>
            <p><small>${item.exercises.map(e => e.name + (e.quantity===1 ? ' (Unilateral)' : '')).join(', ')}</small></p>
        `;
        container.appendChild(div);
    });
}

function deleteHistory(index) {
    let history = JSON.parse(localStorage.getItem('gym_history') || '[]');
    history.splice(index, 1);
    localStorage.setItem('gym_history', JSON.stringify(history));
    loadHistory();
}

// ==========================================
// 6. UTILIDADES
// ==========================================
function showInterface(id) {
    document.querySelectorAll('.interface').forEach(el => { el.classList.remove('active'); el.classList.add('hidden'); });
    document.getElementById(id).classList.remove('hidden');
    document.getElementById(id).classList.add('active');
}

function syncToSupabase() {
    if (navigator.onLine && currentUser) { /* Sync logic */ }
}
window.addEventListener('online', syncToSupabase);
