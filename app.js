// ==========================================
// CONFIGURACIÓN SUPABASE
// ==========================================
const SUPABASE_URL = 'https://doyzequfqtdjtnldewhh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXplcXVmcXRkanRubGRld2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODA4NTksImV4cCI6MjA5NzA1Njg1OX0.hBE_AwyEfKX1pF0rk2No3loAVAVJ6U6AjusAvjQTQmI';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// ESTADO GLOBAL & WAKE LOCK
// ==========================================
let currentUser = null;
let currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 };
let timerInterval = null;
let isPaused = true;
let queue = [];
let currentQueueIndex = 0;
let timeLeftInPhase = 0;
let editIndex = -1;
let currentScheduledDay = 'Lunes';
let wakeLock = null;

async function requestWakeLock() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
}
function releaseWakeLock() { if (wakeLock) { wakeLock.release(); wakeLock = null; } }
document.addEventListener('visibilitychange', async () => { if (wakeLock && document.visibilityState === 'visible') await requestWakeLock(); });

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const equipSelect = document.getElementById('ex-equipment');
    if (equipSelect) { equipSelect.addEventListener('change', toggleQuantity); toggleQuantity(); }
    const daySelect = document.getElementById('routine-day');
    if (daySelect) { daySelect.addEventListener('change', handleDayChange); setDefaultDay(); }
});

function toggleQuantity() {
    const qty = document.getElementById('ex-quantity');
    qty.disabled = (document.getElementById('ex-equipment').value === 'Sin equipo');
    if (qty.disabled) qty.value = '2';
}
function setDefaultDay() {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const today = days[new Date().getDay()];
    document.getElementById('routine-day').value = today;
    currentScheduledDay = today;
}
function handleDayChange() { currentScheduledDay = document.getElementById('routine-day').value; }

// ==========================================
// 1. AUTENTICACIÓN
// ==========================================
async function login() {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ 
        email: document.getElementById('login-email').value, 
        password: document.getElementById('login-password').value 
    });
    if (error) return document.getElementById('auth-message').innerText = error.message;
    currentUser = data.user; showInterface('programmer-section');
}
async function register() {
    const name = document.getElementById('user-name').value;
    const email = document.getElementById('register-email').value;
    const pass = document.getElementById('register-password').value;
    if (pass !== document.getElementById('register-password-confirm').value) return document.getElementById('register-message').innerText = 'No coinciden';
    const { data, error } = await supabaseClient.auth.signUp({ email, password: pass, options: { data: { full_name: name } } });
    if (error) return document.getElementById('register-message').innerText = error.message;
    currentUser = data.user; setTimeout(() => showInterface('programmer-section'), 1000);
}

// ==========================================
// 🆕 2. PRESETS DE TEMPO
// ==========================================
function applyTempoPreset(ecc, pb, con, pt) {
    document.getElementById('tempo-ecc').value = ecc;
    document.getElementById('tempo-pb').value = pb;
    document.getElementById('tempo-con').value = con; // Acepta 'X'
    document.getElementById('tempo-pt').value = pt;
}

// ==========================================
// 3. PROGRAMADOR
// ==========================================
function addExercise() {
    // 🆕 PARSEO INTELIGENTE PARA "X" (EXPLOSIVO)
    let conInput = document.getElementById('tempo-con').value.trim().toUpperCase();
    let isExplosive = (conInput === 'X');
    let conVal = isExplosive ? 1 : (parseInt(conInput) || 0); // Si es X, dura 1 seg para el cálculo

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
            con: conVal,
            pt: parseInt(document.getElementById('tempo-pt').value) || 0,
            isExplosive: isExplosive // 🆕 Guardamos el flag
        },
        rest: { set: parseInt(document.getElementById('rest-set').value) || 0 }
    };
    if (!ex.name) return alert('Ingresa un nombre');
    
    if (editIndex >= 0) { currentRoutine.exercises[editIndex] = ex; editIndex = -1; }
    else { currentRoutine.exercises.push(ex); }
    
    calculateTotalTime();
    renderExerciseList();
    clearExerciseInputs();
}

function clearExerciseInputs() {
    ['ex-name','ex-sets','ex-reps','ex-weight','tempo-ecc','tempo-pb','tempo-con','tempo-pt','rest-set'].forEach(id => {
        const el = document.getElementById(id); if(el) el.value = '';
    });
}

function calculateTotalTime() {
    let totalSeconds = 40;
    const restExSeconds = (parseInt(document.getElementById('rest-ex-global').value) || 0) * 60;
    currentRoutine.exercises.forEach((ex, idx) => {
        const isUnilateral = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
        const repCycle = ex.tempo.ecc + ex.tempo.pb + ex.tempo.con + ex.tempo.pt;
        for (let s = 1; s <= ex.sets; s++) {
            totalSeconds += isUnilateral ? (repCycle * ex.reps) * 2 + 8 : (repCycle * ex.reps);
            if (s < ex.sets) totalSeconds += ex.rest.set;
        }
        if (idx < currentRoutine.exercises.length - 1) totalSeconds += restExSeconds;
    });
    currentRoutine.totalTime = totalSeconds;
    document.getElementById('total-time-display').innerText = formatTime(totalSeconds);
}

function formatTime(s) {
    const m = Math.floor(s / 60); const sec = s % 60;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function renderExerciseList() {
    document.getElementById('exercise-list').innerHTML = currentRoutine.exercises.map((ex, i) => {
        const conDisplay = ex.tempo.isExplosive ? 'X' : ex.tempo.con;
        return `<li><strong>${i+1}. ${ex.name}</strong><br><small>${ex.sets}x${ex.reps} | Tempo: ${ex.tempo.ecc}-${ex.tempo.pb}-${conDisplay}-${ex.tempo.pt}</small></li>`;
    }).join('');
}

function saveRoutineToStorage() {
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    allRoutines[currentScheduledDay] = { ...currentRoutine, bodyPart: document.getElementById('body-part').value };
    localStorage.setItem('scheduled_routines', JSON.stringify(allRoutines));
}
function saveRoutineOnly() { saveRoutineToStorage(); alert('✅ Guardado'); }
function saveAndStartRoutine() {
    saveRoutineToStorage(); buildTimerQueue(); showInterface('executor-section');
    requestWakeLock(); speak("Preparación, 40 segundos", 1.1);
}
function showScheduledRoutines() { showInterface('scheduled-routines-section'); }

// ==========================================
// 4. EJECUTOR (AUDIO, RESPIRACIÓN Y COLORES)
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);

    if (type === 'metronome') {
        osc.type = 'square'; osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'eccentric') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(250, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.5);
        gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc.start(now); osc.stop(now + 0.6);
    } else if (type === 'concentric') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.3);
        gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
    } 
    // 🆕 SONIDO ESPECIAL PARA TEMPO "X" (EXPLOSIVO)
    else if (type === 'con-explosive') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(1500, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.15);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
    }
    else if (type === 'pause') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(500, now);
        gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    }
}

function buildTimerQueue() {
    queue = [{ phase: 'Preparación', duration: 40, action: 'prep' }];
    
    currentRoutine.exercises.forEach((ex) => {
        const isUnilateral = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
        
        for (let s = 1; s <= ex.sets; s++) {
            for (let r = 1; r <= ex.reps; r++) {
                const phases = [];
                if (ex.tempo.ecc > 0) phases.push({ phase: 'Excéntrico', duration: ex.tempo.ecc, action: 'ecc' });
                if (ex.tempo.pb > 0) phases.push({ phase: 'Pausa Abajo', duration: ex.tempo.pb, action: 'pause-bottom' });
                
                // 🆕 MANEJO DE CONCIÓN EXPLOSIVA
                if (ex.tempo.con > 0) {
                    if (ex.tempo.isExplosive) phases.push({ phase: '¡EXPLOSIVO!', duration: 1, action: 'con-explosive' });
                    else phases.push({ phase: 'Concéntrico', duration: ex.tempo.con, action: 'con' });
                }
                
                if (ex.tempo.pt > 0) phases.push({ phase: 'Pausa Arriba', duration: ex.tempo.pt, action: 'pause-top' });
                
                phases.forEach(p => queue.push({ ...p, exerciseName: ex.name, setNumber: s, repNumber: r, isUnilateral }));
            }
            if (isUnilateral) {
                queue.push({ phase: 'Cambio de lado', duration: 8, action: 'rest-trans', exerciseName: ex.name });
                for (let r = 1; r <= ex.reps; r++) {
                    const phases = [];
                    if (ex.tempo.ecc > 0) phases.push({ phase: 'Excéntrico', duration: ex.tempo.ecc, action: 'ecc' });
                    if (ex.tempo.pb > 0) phases.push({ phase: 'Pausa Abajo', duration: ex.tempo.pb, action: 'pause-bottom' });
                    if (ex.tempo.con > 0) {
                        if (ex.tempo.isExplosive) phases.push({ phase: '¡EXPLOSIVO!', duration: 1, action: 'con-explosive' });
                        else phases.push({ phase: 'Concéntrico', duration: ex.tempo.con, action: 'con' });
                    }
                    if (ex.tempo.pt > 0) phases.push({ phase: 'Pausa Arriba', duration: ex.tempo.pt, action: 'pause-top' });
                    phases.forEach(p => queue.push({ ...p, exerciseName: ex.name, setNumber: s, repNumber: r, isUnilateral, side: 'Derecha' }));
                }
            }
            if (s < ex.sets) queue.push({ phase: 'Descanso', duration: ex.rest.set, action: 'rest' });
        }
    });
    queue.push({ phase: '¡Finalizado!', duration: 5, action: 'finish' });
    currentQueueIndex = 0;
    loadNextPhase();
}

function loadNextPhase() {
    if (currentQueueIndex >= queue.length) return;
    const item = queue[currentQueueIndex];
    if (item.duration <= 0) { currentQueueIndex++; loadNextPhase(); return; }
    
    timeLeftInPhase = item.duration;
    updateTimerUI(item);
    
    // 🆕 GUÍA DE RESPIRACIÓN Y AUDIO
    if (item.action === 'prep') speak("Preparación", 1.1);
    else if (item.action === 'ecc') { speak("Excéntrico, inhala", 1.2); playSound('eccentric'); }
    else if (item.action === 'pause-bottom') { speak("Pausa, aguanta", 1.2); playSound('pause'); }
    else if (item.action === 'con') { speak("Concéntrico, exhala", 1.2); playSound('concentric'); }
    else if (item.action === 'con-explosive') { speak("¡Empuja y exhala!", 1.3); playSound('con-explosive'); } // 🆕
    else if (item.action === 'pause-top') { speak("Pausa arriba, respira", 1.2); playSound('pause'); }
    else if (item.action === 'rest') speak("Descanso", 1.1);
    else if (item.action === 'rest-trans') speak("Cambiar de lado", 1.2);
    else if (item.action === 'finish') {
        speak("Felicidades, rutina completada", 1.1);
        releaseWakeLock();
        setTimeout(() => showInterface('history-section'), 2000);
    }
}

function updateTimerUI(item) {
    document.getElementById('current-phase-title').innerText = item.exerciseName ? `${item.exerciseName} (${item.phase})` : item.phase;
    document.getElementById('timer-seconds').innerText = timeLeftInPhase;
    
    const circle = document.querySelector('.progress-ring__circle');
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference - (timeLeftInPhase / item.duration) * circumference;
    
    // 🆕 CAMBIO DE COLOR VISUAL SEGÚN LA FASE
    let color = '#ffffff';
    if (item.action === 'ecc') color = '#ff4444';       // Rojo
    else if (item.action === 'pause-bottom') color = '#ffc107'; // Amarillo
    else if (item.action === 'con' || item.action === 'con-explosive') color = '#28a745'; // Verde
    else if (item.action === 'pause-top') color = '#007bff';    // Azul
    else if (item.action === 'rest' || item.action === 'prep' || item.action === 'rest-trans') color = '#aaaaaa'; // Gris
    
    circle.style.stroke = color;
}

function tick() {
    if (isPaused) return;
    const currentItem = queue[currentQueueIndex];
    
    // Metrónomo auditivo en fases de tempo largas
    if ((currentItem.action === 'ecc' || currentItem.action === 'con') && currentItem.duration >= 2) {
        if (timeLeftInPhase < currentItem.duration && timeLeftInPhase > 0) playSound('metronome');
    }
    
    timeLeftInPhase--;
    updateTimerUI(currentItem);
    
    if (timeLeftInPhase <= 0) {
        currentQueueIndex++;
        if (currentQueueIndex < queue.length) loadNextPhase();
        else { clearInterval(timerInterval); }
    }
}

function toggleTimer() {
    isPaused = !isPaused;
    document.getElementById('btn-start-pause').innerText = isPaused ? 'Reanudar' : 'Pausar';
    if (!isPaused) { timerInterval = setInterval(tick, 1000); requestWakeLock(); }
    else clearInterval(timerInterval);
}

function finishRoutine() { clearInterval(timerInterval); releaseWakeLock(); showInterface('history-section'); }
function pauseAndExit() { clearInterval(timerInterval); isPaused = true; releaseWakeLock(); showInterface('programmer-section'); }

function showInterface(id) {
    document.querySelectorAll('.interface').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}
