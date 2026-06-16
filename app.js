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
let editIndex = -1;

// ==========================================
// FUNCIÓN DE BLOQUEO INTELIGENTE
// ==========================================
function toggleQuantity() {
    const equip = document.getElementById('ex-equipment');
    const qty = document.getElementById('ex-quantity');
    if (!equip || !qty) return;

    if (equip.value === 'Sin equipo') {
        qty.disabled = true;
        qty.value = '2'; 
    } else {
        qty.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const equipSelect = document.getElementById('ex-equipment');
    if (equipSelect) {
        equipSelect.addEventListener('change', toggleQuantity);
        toggleQuantity();
    }
});

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
    speak(randomPhrase, 1.1);
}

function speak(text, rate = 1.1) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es-ES';
        utterance.rate = rate;
        window.speechSynthesis.speak(utterance);
    }
}

// ==========================================
// 3. PROGRAMADOR DE RUTINAS
// ==========================================
function addExercise() {
    const nameEl = document.getElementById('ex-name');
    const qtyEl = document.getElementById('ex-quantity');
    if (!nameEl || !qtyEl) return alert("⚠️ Error de carga. Recarga la página (Ctrl + F5).");

    const ex = {
        name: nameEl.value,
        sets: parseInt(document.getElementById('ex-sets').value) || 1,
        reps: parseInt(document.getElementById('ex-reps').value) || 1,
        weight: document.getElementById('ex-weight').value,
        equipment: document.getElementById('ex-equipment').value,
        quantity: parseInt(qtyEl.value),
        tempo: {
            ecc: parseInt(document.getElementById('tempo-ecc').value) || 0,
            pb: parseInt(document.getElementById('tempo-pb').value) || 0,
            con: parseInt(document.getElementById('tempo-con').value) || 0,
            pt: parseInt(document.getElementById('tempo-pt').value) || 0
        },
        rest: {
            set: parseInt(document.getElementById('rest-set').value) || 0,
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
    clearFormInputs();
}

function clearFormInputs() {
    document.getElementById('ex-name').value = '';
    document.getElementById('ex-sets').value = '';
    document.getElementById('ex-reps').value = '';
    document.getElementById('ex-weight').value = '';
    document.getElementById('ex-equipment').value = 'Sin equipo';
    document.getElementById('ex-quantity').value = '2';
    document.getElementById('tempo-ecc').value = '';
    document.getElementById('tempo-pb').value = '';
    document.getElementById('tempo-con').value = '';
    document.getElementById('tempo-pt').value = '';
    document.getElementById('rest-set').value = '';
    document.getElementById('rest-ex').value = '';
    toggleQuantity();
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
    document.getElementById('rest-ex').value = ex.rest.ex;
    
    toggleQuantity();
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
    let totalSeconds = 40; 
    
    currentRoutine.exercises.forEach(ex => {
        const isUnilateral = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
        const repCycle = ex.tempo.ecc + ex.tempo.pb + ex.tempo.con + ex.tempo.pt;
        
        for (let s = 1; s <= ex.sets; s++) {
            for (let r = 1; r <= ex.reps; r++) {
                totalSeconds += repCycle; // Lado izquierdo (o único)
                
                if (isUnilateral) {
                    totalSeconds += 8; // TRANSICIÓN REDUCIDA A 8 SEGUNDOS
                    totalSeconds += repCycle; // Lado derecho
                }
            }
            if (s < ex.sets) {
                totalSeconds += ex.rest.set;
            }
        }
        totalSeconds += ex.rest.ex;
    });
    
    currentRoutine.totalTime = totalSeconds;
    document.getElementById('total-time-display').innerText = formatTime(totalSeconds);
}

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return h > 0 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function renderExerciseList() {
    const list = document.getElementById('exercise-list');
    list.innerHTML = currentRoutine.exercises.map((ex, i) => {
        const isUnilateral = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
        const note = isUnilateral ? ` (Alternado por repetición: Izq/Der)` : '';
        return `
        <li style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #ddd;">
            <div>
                <strong>${i+1}. ${ex.name}</strong> ${note}<br>
                <small>${ex.sets} series x ${ex.reps} reps | ${ex.equipment} (Cant: ${ex.quantity})</small>
            </div>
            <div>
                <button onclick="editExercise(${i})" style="width: auto; padding: 5px 10px; font-size: 12px; margin: 0 5px; background: #ffc107; color: #000; border: none; border-radius: 5px; cursor: pointer;">✏️</button>
                <button onclick="deleteExercise(${i})" style="width: auto; padding: 5px 10px; font-size: 12px; margin: 0; background: #ff4444; color: #fff; border: none; border-radius: 5px; cursor: pointer;">🗑️</button>
            </div>
        </li>`;
    }).join('');
}

function saveAndStartRoutine() {
    if (currentRoutine.exercises.length === 0) return alert('Añade al menos un ejercicio');
    localStorage.setItem('pending_routine', JSON.stringify(currentRoutine));
    buildTimerQueue();
    showInterface('executor-section');
    speak("Dispondrás de 40 segundos para prepararte", 1.1);
}

// ==========================================
// 4. EJECUTOR (CRONOMETRAJE Y LÓGICA DE VOZ REFINADA)
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;

    if (type === 'metronome') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'square'; osc.frequency.setValueAtTime(1000, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
        gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'eccentric') {
        window.speechSynthesis.cancel(); 
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(250, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.5);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now); osc.stop(now + 0.8);
    } else if (type === 'concentric') {
        window.speechSynthesis.cancel(); 
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
        const isUnilateral = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
        const nextExName = currentRoutine.exercises[exIndex + 1] ? currentRoutine.exercises[exIndex + 1].name : "el final de tu rutina";

        for (let s = 1; s <= ex.sets; s++) {
            for (let
